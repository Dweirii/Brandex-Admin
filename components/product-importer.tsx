"use client"

import type React from "react"

import { useState, useRef } from "react"
import * as XLSX from "exceljs"
import Papa from "papaparse"
import { z } from "zod"
import { importProducts } from "@/actions/import-products"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CheckCircle, AlertCircle, FileSpreadsheet, FileText, Upload } from 'lucide-react'

// Define the product schema for validation
const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  price: z.coerce.number().positive("Price must be positive"),
  categoryId: z.string().min(1, "Category ID is required"),
  downloadUrl: z.string().url().optional().nullable(),
  keywords: z.array(z.string()).optional().default([]),
  isFeatured: z.boolean().optional().default(false),
  isArchived: z.boolean().optional().default(false),
})

type ProductInput = z.infer<typeof productSchema>

interface ProductImporterProps {
  storeId: string
}

export function ProductImporter({ storeId }: ProductImporterProps) {
  const [products, setProducts] = useState<ProductInput[]>([])
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{
    success: number
    failed: number
    total: number
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    setProducts([])
    setErrors([])
    setResult(null)
    setProgress(0)

    try {
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        await parseExcel(file)
      } else if (file.name.endsWith(".csv")) {
        parseCSV(file)
      } else {
        setErrors([{ row: 0, message: "Unsupported file format. Please upload .xlsx, .xls, or .csv files." }])
      }
    } catch (error) {
      setErrors([{ row: 0, message: `Error parsing file: ${error instanceof Error ? error.message : String(error)}` }])
    } finally {
      setIsLoading(false)
    }
  }

  const parseExcel = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer()
    const workbook = new XLSX.Workbook()
    await workbook.xlsx.load(arrayBuffer)

    const worksheet = workbook.getWorksheet(1)
    if (!worksheet) {
      setErrors([{ row: 0, message: "No worksheet found in the Excel file." }])
      return
    }

    const headers = worksheet.getRow(1).values as string[]
    const products: ProductInput[] = []
    const errors: { row: number; message: string }[] = []

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return // Skip header row

      try {
        const product: Record<string, any> = {}
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber]
          if (header) {
            if (header === "keywords") {
              // Handle keywords as comma-separated values
              product[header] = cell.value
                ? String(cell.value)
                    .split(",")
                    .map((k) => k.trim())
                : []
            } else if (header === "isFeatured" || header === "isArchived") {
              // Handle boolean values
              product[header] = cell.value === "true" || cell.value === true || cell.value === 1
            } else if (header === "downloadUrl") {
              // Handle hyperlink objects from Excel
              if (cell.value && typeof cell.value === "object" && "hyperlink" in cell.value) {
                product[header] = cell.value.hyperlink
              } else if (cell.value && typeof cell.value === "object" && "text" in cell.value && "hyperlink" in cell.value) {
                product[header] = cell.value.hyperlink
              } else {
                product[header] = cell.value
              }
            } else {
              product[header] = cell.value
            }
          }
        })

        // Client-side validation
        const result = productSchema.safeParse(product)
        if (result.success) {
          products.push(result.data)
        } else {
          result.error.errors.forEach((err) => {
            errors.push({ row: rowNumber, message: `${err.path.join(".")}: ${err.message}` })
          })
        }
      } catch (error) {
        errors.push({
          row: rowNumber,
          message: `Error parsing row: ${error instanceof Error ? error.message : String(error)}`,
        })
      }
    })

    setProducts(products)
    setErrors(errors)
  }

  const parseCSV = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const products: ProductInput[] = []
        const errors: { row: number; message: string }[] = []

        results.data.forEach((row: any, index: number) => {
          try {
            // Process keywords from string to array
            if (row.keywords && typeof row.keywords === "string") {
              row.keywords = row.keywords.split(",").map((k: string) => k.trim())
            } else {
              row.keywords = []
            }

            // Handle downloadUrl that might be parsed as an object
            if (row.downloadUrl && typeof row.downloadUrl === "object") {
              if ("hyperlink" in row.downloadUrl) {
                row.downloadUrl = row.downloadUrl.hyperlink
              } else if ("text" in row.downloadUrl && "hyperlink" in row.downloadUrl) {
                row.downloadUrl = row.downloadUrl.hyperlink
              }
            }

            // Convert boolean strings to actual booleans
            if (row.isFeatured) {
              row.isFeatured = row.isFeatured === "true" || row.isFeatured === "1"
            }
            if (row.isArchived) {
              row.isArchived = row.isArchived === "true" || row.isArchived === "1"
            }

            // Client-side validation
            const result = productSchema.safeParse(row)
            if (result.success) {
              products.push(result.data)
            } else {
              result.error.errors.forEach((err) => {
                errors.push({ row: index + 2, message: `${err.path.join(".")}: ${err.message}` })
              })
            }
          } catch (error) {
            errors.push({
              row: index + 2,
              message: `Error parsing row: ${error instanceof Error ? error.message : String(error)}`,
            })
          }
        })

        setProducts(products)
        setErrors(errors)
      },
      error: (error) => {
        setErrors([{ row: 0, message: `Error parsing CSV: ${error.message}` }])
      },
    })
  }

  const handleImport = async () => {
    if (products.length === 0) return

    setIsUploading(true)
    setProgress(0)
    setResult(null)

    try {
      // Process in batches of 500
      const batchSize = 500
      const batches = Math.ceil(products.length / batchSize)
      let successCount = 0
      let failedCount = 0

      for (let i = 0; i < batches; i++) {
        const start = i * batchSize
        const end = Math.min(start + batchSize, products.length)
        const batch = products.slice(start, end)

        // Update progress
        setProgress(Math.round((i / batches) * 100))

        // Call the server action to import the batch
        const result = await importProducts(storeId, batch)

        successCount += result.success
        failedCount += result.failed
      }

      setProgress(100)
      setResult({
        success: successCount,
        failed: failedCount,
        total: products.length,
      })
    } catch (error) {
      setErrors((prev) => [
        ...prev,
        { row: 0, message: `Import failed: ${error instanceof Error ? error.message : String(error)}` },
      ])
    } finally {
      setIsUploading(false)
    }
  }

  const resetForm = () => {
    setProducts([])
    setErrors([])
    setResult(null)
    setProgress(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-medium mb-4">Upload Product Data</h3>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
              ref={fileInputRef}
              disabled={isLoading || isUploading}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isUploading}
              variant="outline"
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Select File
            </Button>
            <div className="text-sm text-muted-foreground">Supported formats: .xlsx, .xls, .csv</div>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="animate-spin">⏳</span> Parsing file...
            </div>
          )}

          {products.length > 0 && (
            <Alert  className="bg-muted/50">
              <FileSpreadsheet className="h-4 w-4" />
              <AlertTitle>File Parsed Successfully</AlertTitle>
              <AlertDescription>
                Found {products.length} products ready to import.
                {errors.length > 0 && ` (${errors.length} rows have validation errors)`}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

      {products.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-medium mb-4">Preview ({products.length} products)</h3>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Category ID</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Price</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Keywords</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Download URL</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Featured</th>
                </tr>
              </thead>
              <tbody>
                {products.slice(0, 10).map((product, index) => (
                  <tr key={index} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-2 text-sm">{product.name}</td>
                    <td className="px-4 py-2 text-sm">{product.categoryId}</td>
                    <td className="px-4 py-2 text-sm">${Number(product.price).toFixed(2)}</td>
                    <td className="px-4 py-2 text-sm">{product.keywords.join(", ")}</td>
                    <td className="px-4 py-2 text-sm truncate max-w-[200px]">{product.downloadUrl || "-"}</td>
                    <td className="px-4 py-2 text-sm">{product.isFeatured ? "Yes" : "No"}</td>
                  </tr>
                ))}
                {products.length > 10 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-2 text-sm text-center text-muted-foreground">
                      ... and {products.length - 10} more products
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <Button onClick={handleImport} disabled={isUploading || products.length === 0} className="gap-2">
              {isUploading ? (
                <>
                  <span className="animate-spin">⏳</span> Importing...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Import {products.length} Products
                </>
              )}
            </Button>
            <Button variant="outline" onClick={resetForm} disabled={isUploading}>
              Cancel
            </Button>
          </div>

          {isUploading && (
            <div className="mt-4">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-muted-foreground mt-2">
                Importing products in batches of 500... {progress}% complete
              </p>
            </div>
          )}

          {result && (
            <Alert className="mt-4">
              {result.failed > 0 ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
              <AlertTitle>Import Complete</AlertTitle>
              <AlertDescription>
                Successfully imported {result.success} of {result.total} products.
                {result.failed > 0 && ` ${result.failed} products failed validation.`}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h3 className="text-lg font-medium mb-4 text-destructive">Validation Errors ({errors.length})</h3>

          <div className="overflow-y-auto max-h-[300px]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Row</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Error</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((error, index) => (
                  <tr key={index} className="border-b hover:bg-muted/50">
                    <td className="px-4 py-2 text-sm">{error.row}</td>
                    <td className="px-4 py-2 text-sm text-destructive">{error.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
