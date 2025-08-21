import { getDocument } from "pdfjs-dist/legacy/build/pdf"
import type { ParsedStatement, PDFType, Txn, StatementHeader } from "./types"
import type { ImageData } from "canvas"

export async function parsePdf(buffer: Buffer): Promise<ParsedStatement> {
  try {
    console.log("[v0] Starting PDF parsing process...")

    // Step 1: Extract text from entire document
    const { fullText, diagnostics } = await extractFullDocumentText(buffer)
    console.log("[v0] Text extraction diagnostics:", diagnostics)
    console.log("[v0] First 300 chars of extracted text:", fullText.substring(0, 300))

    // Step 2: Detect readability (don't throw, just decide branch)
    const pdfType = detectReadability(fullText, diagnostics)
    console.log("[v0] PDF readability assessment:", pdfType)

    let finalText = fullText

    // Step 3: If scanned/unreadable, try OCR
    if (pdfType === "scanned" || (pdfType === "unreadable" && diagnostics.textLength < 50)) {
      console.log("[v0] Attempting OCR extraction...")
      try {
        finalText = await extractTextWithOCR(buffer)
        console.log("[v0] OCR completed, text length:", finalText.length)
        console.log("[v0] First 300 chars of OCR text:", finalText.substring(0, 300))
      } catch (ocrError) {
        console.warn("[v0] OCR failed:", ocrError.message)
        // Continue with original text even if OCR fails
      }
    }

    // Step 4: Parse statement (always attempt, don't throw on low confidence)
    const result = parseStatementText(finalText)

    // Step 5: Add diagnostics to result for debugging
    console.log("[v0] Final parsing result:", {
      textExtractionDiagnostics: diagnostics,
      pdfType,
      headerScore: result.header.rowScore,
      transactionCount: result.transactions.length,
      documentScore: result.documentScore,
    })

    return result
  } catch (error) {
    console.error("[v0] PDF parsing failed:", error)
    throw new Error(`PDF parsing failed: ${error.message}`)
  }
}

async function extractFullDocumentText(buffer: Buffer): Promise<{
  fullText: string
  diagnostics: {
    textLength: number
    digitCount: number
    asciiRatio: number
    pageCount: number
  }
}> {
  try {
    console.log("[v0] Starting text extraction - buffer length:", buffer.byteLength)

    if (buffer.byteLength === 0) {
      throw new Error("Buffer is empty")
    }

    const uint8Array = new Uint8Array(buffer)
    console.log("[v0] Using Uint8Array length:", uint8Array.length, "type:", uint8Array.constructor.name)

    const pdf = await getDocument({
      data: uint8Array,
    }).promise

    console.log("[v0] PDF loaded successfully, pages:", pdf.numPages)

    let fullText = ""

    // Extract text from ALL pages, not just page 1
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`[v0] Processing page ${i}/${pdf.numPages}`)
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()

      const items = textContent.items as any[]
      console.log(`[v0] Page ${i} has ${items.length} text items`)

      // Sort items by Y position (top to bottom) then X position (left to right)
      items.sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5] // Y coordinate (inverted)
        if (Math.abs(yDiff) > 5) return yDiff > 0 ? 1 : -1 // Different lines
        return a.transform[4] - b.transform[4] // Same line, sort by X
      })

      let currentY = items[0]?.transform[5]
      let lineText = ""

      for (const item of items) {
        const itemY = item.transform[5]

        // If Y position changed significantly, we're on a new line
        if (Math.abs(currentY - itemY) > 5) {
          if (lineText.trim()) {
            fullText += lineText.trim() + "\n"
          }
          lineText = item.str
          currentY = itemY
        } else {
          // Same line, add space if needed
          if (lineText && !lineText.endsWith(" ") && !item.str.startsWith(" ")) {
            lineText += " "
          }
          lineText += item.str
        }
      }

      // Add the last line
      if (lineText.trim()) {
        fullText += lineText.trim() + "\n"
      }

      // Add page break
      if (i < pdf.numPages) {
        fullText += "\n"
      }
    }

    // Calculate diagnostics
    const textLength = fullText.length
    const digitCount = (fullText.match(/\d/g) || []).length
    const asciiCount = (fullText.match(/[\x20-\x7E]/g) || []).length
    const asciiRatio = textLength > 0 ? asciiCount / textLength : 0

    const diagnostics = {
      textLength,
      digitCount,
      asciiRatio: Math.round(asciiRatio * 1000) / 1000, // 3 decimal places
      pageCount: pdf.numPages,
    }

    console.log("[v0] Text extraction complete:")
    console.log("[v0] - Buffer byte length:", buffer.byteLength)
    console.log("[v0] - Page count:", diagnostics.pageCount)
    console.log("[v0] - Text length:", diagnostics.textLength)
    console.log("[v0] - Digit count:", diagnostics.digitCount)
    console.log("[v0] - First 300 chars:", fullText.substring(0, 300))

    return { fullText, diagnostics }
  } catch (error) {
    console.error("[v0] Text extraction failed:", error)
    return {
      fullText: "",
      diagnostics: { textLength: 0, digitCount: 0, asciiRatio: 0, pageCount: 0 },
    }
  }
}

function detectReadability(text: string, diagnostics: any): PDFType {
  const { textLength, digitCount, asciiRatio } = diagnostics

  console.log("[v0] Readability assessment:")
  console.log("[v0] - Text length:", textLength)
  console.log("[v0] - Digit count:", digitCount)
  console.log("[v0] - ASCII ratio:", asciiRatio)

  // More tolerant thresholds for whole document
  if (textLength > 200 && digitCount > 10 && asciiRatio > 0.7) {
    return "text"
  }

  if (textLength > 50 && digitCount > 3) {
    return "text" // Still try text-based parsing
  }

  if (textLength > 10) {
    return "scanned" // Try OCR
  }

  return "unreadable" // Will still try OCR as fallback
}

async function extractTextWithOCR(buffer: Buffer): Promise<string> {
  console.log("[v0] OCR is disabled for MVP - focusing on text-based PDFs first")
  throw new Error("OCR is currently disabled for MVP. Please use text-based PDFs only.")

  /*
  try {
    console.log("[v0] Starting OCR extraction...")

    // Convert PDF to images first
    const images = await convertPdfToImages(buffer)

    // Initialize Tesseract worker
    const worker = await createWorker("eng")

    let fullText = ""

    // Process each page image with OCR
    for (let i = 0; i < images.length; i++) {
      console.log(`[v0] Processing page ${i + 1} with OCR...`)

      const {
        data: { text },
      } = await worker.recognize(images[i])
      fullText += text + "\n"
    }

    await worker.terminate()

    console.log("[v0] OCR extraction completed")
    return fullText
  } catch (error) {
    console.error("[v0] OCR extraction failed:", error)
    throw new Error("OCR processing failed. The scanned document may be too unclear to read.")
  }
  */
}

async function convertPdfToImages(buffer: Buffer): Promise<ImageData[]> {
  const uint8Array = new Uint8Array(buffer)
  console.log(
    "[v0] convertPdfToImages using Uint8Array length:",
    uint8Array.length,
    "type:",
    uint8Array.constructor.name,
  )

  const pdf = await getDocument({ data: uint8Array }).promise
  const images: ImageData[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2.0 }) // Higher scale for better OCR

    // Create canvas
    const canvas = new OffscreenCanvas(viewport.width, viewport.height)
    const context = canvas.getContext("2d")

    if (!context) {
      throw new Error("Could not create canvas context for PDF rendering")
    }

    // Render page to canvas
    await page.render({
      canvasContext: context as any,
      viewport: viewport,
    }).promise

    // Get image data
    const imageData = context.getImageData(0, 0, viewport.width, viewport.height)
    images.push(imageData)
  }

  return images
}

function parseStatementText(text: string): ParsedStatement {
  try {
    console.log("[v0] Starting statement text parsing...")
    console.log("[v0] Input text length:", text.length)
    console.log("[v0] First 300 characters:", text.substring(0, 300))

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line)

    console.log("[v0] Split into", lines.length, "non-empty lines")

    const header = extractHeaderInfo(lines)
    console.log("[v0] Header extraction completed")

    const transactions = extractTransactions(lines)
    console.log("[v0] Transaction extraction completed, found", transactions.length, "transactions")

    if (transactions.length === 0) {
      console.warn("[v0] WARNING: No transactions found in statement")
    }

    const documentScore = calculateDocumentScore(header, transactions)
    console.log("[v0] Document score calculated:", documentScore)

    const result = {
      header: { ...header, rowScore: calculateHeaderScore(header) },
      transactions: transactions.map((txn) => ({
        ...txn,
        rowScore: calculateTransactionScore(txn),
      })),
      documentScore,
    }

    console.log("[v0] Final parsed result summary:", {
      headerScore: result.header.rowScore,
      transactionCount: result.transactions.length,
      documentScore: result.documentScore,
    })

    return result
  } catch (error) {
    console.error("[v0] Statement text parsing failed:", error)
    throw new Error(`Statement parsing failed: ${error.message}`)
  }
}

function extractHeaderInfo(lines: string[]): StatementHeader {
  const header: StatementHeader = {
    bank: "unknown",
    bankAccount: "unknown",
    customerAccount: "unknown",
    statementDate: "unknown",
    openingBalance: "0",
    closingBalance: "0",
    rowScore: 0,
  }

  console.log("[v0] Processing header from lines:", lines.slice(0, 15))

  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const line = lines[i]
    const lowerLine = line.toLowerCase()

    if (
      (lowerLine.includes("bank") || lowerLine.includes("credit card")) &&
      lowerLine.includes("statement") &&
      header.bank === "unknown"
    ) {
      header.bank = line.replace(/\s+/g, " ").trim()
    }

    if (lowerLine.includes("account") && lowerLine.includes("number")) {
      const accountMatch = line.match(/[*x\d\s-]{4,}/i)
      if (accountMatch) {
        header.customerAccount = accountMatch[0].trim()
      }
    }

    if (lowerLine.includes("statement") && lowerLine.includes("date")) {
      const dateMatch = line.match(/\d{4}-\d{2}-\d{2}|\w{3}\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{4}/)
      if (dateMatch) {
        header.statementDate = normalizeDate(dateMatch[0])
      }
    }

    if (lowerLine.includes("opening") && /\$[\d,]+\.\d{2}/.test(line)) {
      const balanceMatch = line.match(/\$[\d,]+\.\d{2}/)
      if (balanceMatch) {
        header.openingBalance = balanceMatch[0].replace("$", "")
      }
    }

    if (lowerLine.includes("closing") && /\$[\d,]+\.\d{2}/.test(line)) {
      const balanceMatch = line.match(/\$[\d,]+\.\d{2}/)
      if (balanceMatch) {
        header.closingBalance = balanceMatch[0].replace("$", "")
      }
    }
  }

  console.log("[v0] Extracted header:", header)
  return header
}

function extractTransactions(lines: string[]): Txn[] {
  const transactions: Txn[] = []
  const currency = detectCurrency(lines.join(" "))

  console.log("[v0] Processing transactions from", lines.length, "lines")
  console.log("[v0] Detected currency:", currency)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Skip obvious header lines
    if (isHeaderLine(line)) {
      continue
    }

    const dateMatch = line.match(/\d{4}-\d{2}-\d{2}/)
    if (!dateMatch) {
      continue
    }

    const amountMatch = line.match(/\$?[\d,]+\.\d{2}|$$[\d,]+\.\d{2}$$/)
    if (!amountMatch) {
      continue
    }

    const date = normalizeDate(dateMatch[0])
    const amount = normalizeAmount(amountMatch[0])

    const dateIndex = line.indexOf(dateMatch[0])
    const amountIndex = line.indexOf(amountMatch[0])

    let description = ""
    if (dateIndex < amountIndex) {
      description = line.substring(dateIndex + dateMatch[0].length, amountIndex).trim()
    } else {
      const beforeDate = line.substring(0, dateIndex).trim()
      const afterAmount = line.substring(amountIndex + amountMatch[0].length).trim()
      description = beforeDate || afterAmount
    }

    if (description.length >= 1) {
      const transaction = {
        date,
        description: mergeMultilineDescription(description),
        amount,
        currency,
        rowScore: 0,
      }
      transactions.push(transaction)
      console.log("[v0] Found transaction:", transaction)
    }
  }

  console.log("[v0] Total transactions found:", transactions.length)
  return transactions
}

function detectCurrency(text: string): string {
  const currencyPatterns = [
    { pattern: /\$|USD|US\s*Dollar/i, code: "USD" },
    { pattern: /€|EUR|Euro/i, code: "EUR" },
    { pattern: /£|GBP|Pound/i, code: "GBP" },
    { pattern: /₱|PHP|Peso/i, code: "PHP" },
    { pattern: /S\$|SGD|Singapore/i, code: "SGD" },
  ]

  for (const { pattern, code } of currencyPatterns) {
    if (pattern.test(text)) {
      return code
    }
  }

  return "USD" // Default fallback
}

function isHeaderLine(line: string): boolean {
  const headerKeywords = [
    "statement",
    "account",
    "balance",
    "total",
    "summary",
    "date",
    "description",
    "amount",
    "debit",
    "credit",
  ]

  const lowerLine = line.toLowerCase()
  return headerKeywords.some((keyword) => lowerLine.includes(keyword)) && !line.match(/\d{4}-\d{2}-\d{2}/) // But has no date
}

function normalizeDate(dateStr: string): string {
  const cleanDate = dateStr.replace(/[^\d/\-.]/g, "")

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    return cleanDate
  }

  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
  const monthMatch = dateStr.toLowerCase().match(/(\w{3})\s+(\d{1,2}),?\s+(\d{4})/)

  if (monthMatch) {
    const monthIndex = monthNames.indexOf(monthMatch[1])
    if (monthIndex !== -1) {
      const year = monthMatch[3]
      const month = String(monthIndex + 1).padStart(2, "0")
      const day = String(Number.parseInt(monthMatch[2])).padStart(2, "0")
      return `${year}-${month}-${day}`
    }
  }

  if (/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}$/.test(cleanDate)) {
    const parts = cleanDate.split(/[/\-.]/)
    const date = new Date(Number.parseInt(parts[2]), Number.parseInt(parts[0]) - 1, Number.parseInt(parts[1]))

    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0]
    }
  }

  return ""
}

function normalizeAmount(amountStr: string): string {
  console.log("[v0] Normalizing amount:", amountStr)

  const isNegative = (amountStr.includes("(") && amountStr.includes(")")) || amountStr.startsWith("-")

  const numericStr = amountStr.replace(/[$()]/g, "").replace(/[^\d.,]/g, "")
  const amount = Number.parseFloat(numericStr.replace(/,/g, ""))

  if (isNaN(amount)) return "0.00"

  const finalAmount = isNegative ? -amount : amount
  const result = finalAmount.toFixed(2)
  console.log("[v0] Normalized amount result:", result)
  return result
}

function mergeMultilineDescription(description: string): string {
  // Clean up and merge description text
  return description
    .replace(/\s+/g, " ")
    .replace(/[^\w\s\-.]/g, " ")
    .trim()
}

function calculateTransactionScore(txn: Txn): number {
  let score = 0

  // Valid date parsed → +0.5
  if (txn.date && /^\d{4}-\d{2}-\d{2}$/.test(txn.date)) {
    score += 0.5
  }

  // Valid amount parsed → +0.4
  if (txn.amount && !isNaN(Number.parseFloat(txn.amount))) {
    score += 0.4
  }

  // Description has ≥ 3 tokens → +0.1
  if (txn.description && txn.description.split(" ").length >= 3) {
    score += 0.1
  }

  return score
}

function calculateHeaderScore(header: StatementHeader): number {
  let score = 0

  // Valid bank, bank account number OR customer account parsed → 0.5
  if (
    (header.bank && header.bank !== "unknown") ||
    (header.bankAccount && header.bankAccount !== "unknown") ||
    (header.customerAccount && header.customerAccount !== "unknown")
  ) {
    score += 0.5
  }

  // Valid statement date parsed → 0.1
  if (header.statementDate && header.statementDate !== "unknown") {
    score += 0.1
  }

  // Valid opening balance parsed → 0.2
  if (header.openingBalance && header.openingBalance !== "0") {
    score += 0.2
  }

  // Valid ending balance parsed → 0.2
  if (header.closingBalance && header.closingBalance !== "0") {
    score += 0.2
  }

  return score
}

function calculateDocumentScore(header: StatementHeader, transactions: Txn[]): number {
  // Get mean of all row points
  const allScores = [header.rowScore, ...transactions.map((t) => t.rowScore)]
  const meanScore = allScores.reduce((sum, score) => sum + score, 0) / allScores.length

  let documentScore = meanScore

  // Check if opening balance + sum of transactions = ending balance → add 0.1
  if (header.openingBalance !== "0" && header.closingBalance !== "0") {
    const opening = Number.parseFloat(header.openingBalance.replace(/,/g, ""))
    const closing = Number.parseFloat(header.closingBalance.replace(/,/g, ""))
    const transactionSum = transactions.reduce((sum, txn) => sum + Number.parseFloat(txn.amount), 0)

    if (Math.abs(opening + transactionSum - closing) < 0.01) {
      documentScore += 0.1
    }
  }

  // Round to 5 decimal places
  return Math.round(documentScore * 100000) / 100000
}
