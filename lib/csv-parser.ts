import { parse } from "csv-parse/sync"
import type { Txn } from "./types" // Assuming Txn is declared in a separate file

export function parseCsv(buffer: Buffer): Txn[] {
  const content = buffer.toString("utf-8")

  const delimiter = detectDelimiter(content)

  let records: string[][]
  try {
    records = parse(content, {
      delimiter,
      skip_empty_lines: true,
      trim: true,
    })
  } catch (error) {
    console.log("[v0] CSV parsing failed:", error)
    return []
  }

  if (records.length === 0) {
    return []
  }

  const hasHeader = isHeaderRow(records[0])
  const dataRows = hasHeader ? records.slice(1) : records

  console.log("[v0] Detected delimiter:", delimiter)
  console.log("[v0] Has header:", hasHeader)
  console.log("[v0] First few records:", records.slice(0, 3))

  return dataRows
    .map((row) => {
      // Ensure we have at least 3 columns
      if (row.length < 3) {
        console.log("[v0] Skipping row with insufficient columns:", row)
        return null
      }

      const [dateStr, description, amountStr] = row

      return {
        date: normalizeDate(dateStr?.trim() || ""),
        description: description?.trim() || "",
        amount: amountStr?.trim() || "0",
      }
    })
    .filter((txn): txn is Txn => txn !== null && txn.date && txn.description)
}

function detectDelimiter(content: string): string {
  const lines = content.split("\n").slice(0, 5) // Check first 5 lines

  let commaCount = 0
  let semicolonCount = 0

  for (const line of lines) {
    if (line.trim()) {
      commaCount += (line.match(/,/g) || []).length
      semicolonCount += (line.match(/;/g) || []).length
    }
  }

  console.log("[v0] Comma count:", commaCount, "Semicolon count:", semicolonCount)

  // Return the delimiter that appears more frequently
  return semicolonCount > commaCount ? ";" : ","
}

function isHeaderRow(row: string[]): boolean {
  if (!row || row.length === 0) return false

  const firstCell = row[0]?.toLowerCase().trim()

  const headerKeywords = [
    "date",
    "transaction",
    "description",
    "amount",
    "debit",
    "credit",
    "txn",
    "details",
    "amt",
    "posting",
    "reference",
  ]

  return headerKeywords.some((keyword) => firstCell?.includes(keyword))
}

function normalizeDate(dateStr: string): string {
  if (!dateStr) return ""

  // Handle common date formats: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, etc.
  const cleanDate = dateStr.replace(/[^\d/\-.]/g, "")

  // Try to parse various formats
  let date: Date | null = null

  // YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    date = new Date(cleanDate)
  }
  // MM/DD/YYYY or DD/MM/YYYY format
  else if (/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}$/.test(cleanDate)) {
    const parts = cleanDate.split(/[/\-.]/)
    // Assume MM/DD/YYYY for US format (most credit card statements)
    date = new Date(Number.parseInt(parts[2]), Number.parseInt(parts[0]) - 1, Number.parseInt(parts[1]))
  }
  // DD/MM/YYYY format (try if first attempt seems wrong)
  else if (/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}$/.test(cleanDate)) {
    const parts = cleanDate.split(/[/\-.]/)
    const mmddyyyy = new Date(Number.parseInt(parts[2]), Number.parseInt(parts[0]) - 1, Number.parseInt(parts[1]))
    const ddmmyyyy = new Date(Number.parseInt(parts[2]), Number.parseInt(parts[1]) - 1, Number.parseInt(parts[0]))

    // Use the date that makes more sense (not in future, valid month/day)
    date = mmddyyyy.getTime() > Date.now() ? ddmmyyyy : mmddyyyy
  }

  if (!date || isNaN(date.getTime())) {
    return ""
  }

  // Return in ISO format (YYYY-MM-DD)
  return date.toISOString().split("T")[0]
}
