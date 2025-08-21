"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setResult(null)
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/parse-statement", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to parse file")
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Statement Parser Test</h1>
        <p className="text-muted-foreground mt-2">Upload CSV, PDF, or XLSX bank statements to test the parser</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload File</CardTitle>
          <CardDescription>Select a bank statement file to parse (CSV, PDF, or XLSX)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="file">Choose File</Label>
            <Input id="file" type="file" accept=".csv,.pdf,.xlsx" onChange={handleFileChange} className="mt-1" />
          </div>

          {file && (
            <div className="text-sm text-muted-foreground">
              Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}

          <Button onClick={handleUpload} disabled={!file || loading} className="w-full">
            {loading ? "Parsing..." : "Parse Statement"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Parse Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Header Information */}
              <div>
                <h3 className="font-semibold mb-2">Header Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Bank:</strong> {result.header?.bank || "unknown"}
                  </div>
                  <div>
                    <strong>Account:</strong> {result.header?.bankAccount || "unknown"}
                  </div>
                  <div>
                    <strong>Customer Account:</strong> {result.header?.customerAccountNumber || "unknown"}
                  </div>
                  <div>
                    <strong>Statement Date:</strong> {result.header?.statementDate || "unknown"}
                  </div>
                  <div>
                    <strong>Opening Balance:</strong> {result.header?.openingBalance || "0"}
                  </div>
                  <div>
                    <strong>Closing Balance:</strong> {result.header?.closingBalance || "0"}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div>
                <h3 className="font-semibold mb-2">Summary</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <strong>Transactions:</strong> {result.count}
                  </div>
                  <div>
                    <strong>Currency:</strong> {result.currency}
                  </div>
                  <div>
                    <strong>Document Score:</strong> {result.documentScore}
                  </div>
                </div>
              </div>

              {/* Transactions */}
              {result.transactions && result.transactions.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Transactions</h3>
                  <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-sm border-collapse border border-gray-200">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-200 p-2 text-left">Date</th>
                          <th className="border border-gray-200 p-2 text-left">Description</th>
                          <th className="border border-gray-200 p-2 text-right">Amount</th>
                          <th className="border border-gray-200 p-2 text-center">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.transactions.map((txn: any, index: number) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="border border-gray-200 p-2">{txn.date}</td>
                            <td className="border border-gray-200 p-2">{txn.description}</td>
                            <td className="border border-gray-200 p-2 text-right">
                              {txn.currency} {txn.amount}
                            </td>
                            <td className="border border-gray-200 p-2 text-center">{txn.rowLevelPoint}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Raw JSON (collapsible) */}
              <details className="mt-4">
                <summary className="cursor-pointer font-semibold">Raw JSON Response</summary>
                <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto max-h-64">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
