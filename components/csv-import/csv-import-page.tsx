"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { useDropzone } from "react-dropzone"
import Papa from "papaparse"
import { toast } from "react-hot-toast"
import { UploadCloud, AlertCircle, TableIcon, CheckCircle, Download, FileText, Loader2 } from "lucide-react"
import {
  validateProductBatch,
  type ProductImportRow,
  type ValidatedProductImportRow,
} from "@/lib/validation/product-import-schema"
import { exportFailedRowsAsCsv } from "@/lib/utils/export-failed-rows"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ErrorManagement } from "./error-management"

interface CsvImportPageProps {
  storeId: string
  onImportSuccess?: () => void
}

interface ValidationError {
  row: number
  field: string
  message: string
}

interface ImportResult {
  success: boolean
  processed: number
  failed: number
  errors: ValidationError[]
  failedRows: ProductImportRow[]
  importId?: string
}

type ImportStatus = "idle" | "parsing" | "uploading" | "completed" | "error"

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const PREVIEW_ROWS = 5

export default function CsvImportPage({ storeId, onImportSuccess }: CsvImportPageProps) {
  const [rows, setRows] = useState<ValidatedProductImportRow[]>([])
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [status, setStatus] = useState<ImportStatus>("idle")
  const [uploadProgress, setUploadProgress] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState<string>("")
  const [showErrorManagement, setShowErrorManagement] = useState(false)
  const [originalRows, setOriginalRows] = useState<ProductImportRow[]>([])

  // Monitoring state
  const [monitoring, setMonitoring] = useState(false)
  const [currentImportId, setCurrentImportId] = useState<string | null>(null)

  const isLoading = status === "parsing" || status === "uploading" || monitoring
  const hasErrors = validationErrors.length > 0
  const canImport = rows.length > 0 && !hasErrors && !isLoading

  // Polling effect
  useEffect(() => {
    if (!monitoring || !currentImportId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/${storeId}/import-status/${currentImportId}`)
        if (!res.ok) return

        const data = await res.json()

        // Calculate progress
        const total = data.totalRows || 1
        const processed = (data.processedRows || 0) + (data.failedRows || 0)
        const progress = Math.min(Math.round((processed / total) * 100), 100)

        setUploadProgress(progress)

        if (data.status === "COMPLETED" || data.status === "FAILED" || data.status === "COMPLETED_WITH_ERRORS") {
          setMonitoring(false)
          setStatus("completed")
          setImportResult({
            success: data.status !== "FAILED",
            processed: data.processedRows || 0,
            failed: data.failedRows || 0,
            errors: [],
            failedRows: [] // We don't have these details in the poll response yet
          })

          if (data.status === "FAILED") {
            toast.error("Import failed.")
          } else {
            toast.success("Import completed!")
          }
        }
      } catch (error) {
        console.error("Polling error:", error)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [monitoring, currentImportId, storeId])

  const stats = useMemo(
    () => ({
      totalRows: rows.length,
      validRows: rows.length - validationErrors.length,
      errorRows: validationErrors.length,
    }),
    [rows.length, validationErrors.length],
  )

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setStatus("parsing")
    setImportResult(null)
    setFileName(file.name)
    setValidationErrors([])
    setRows([])

    Papa.parse<ProductImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
      complete: (results) => {
        try {
          if (results.errors.length > 0) {
            const errorMessages = results.errors.map((err) => err.message).join(", ")
            toast.error(`CSV parsing errors: ${errorMessages}`)
            setStatus("error")
            return
          }

          setOriginalRows(results.data)
          const { validRows, errors } = validateProductBatch(results.data)

          setRows(validRows)
          setValidationErrors(errors)
          setStatus("completed")

          if (errors.length > 0) {
            setShowErrorManagement(true)
            const rejectedCount = results.data.length - validRows.length;
            toast.error(`Found ${errors.length} validation errors in ${rejectedCount} products. ${validRows.length} products passed validation. Please review and fix them.`, { duration: 6000 });
            console.warn(`⚠️ VALIDATION SUMMARY: ${results.data.length} total rows → ${validRows.length} valid → ${rejectedCount} rejected`);
          } else {
            toast.success(`Successfully parsed ${validRows.length} rows.`)
            console.log(`✅ VALIDATION SUMMARY: All ${validRows.length} products passed validation`);
          }
        } catch (error) {
          console.error("Validation error:", error)
          toast.error("Failed to validate CSV data. Please check the file format.")
          setStatus("error")
        }
      },
      error: (error) => {
        console.error("CSV parsing error:", error)
        toast.error(`Failed to parse CSV: ${error.message}`)
        setStatus("error")
      },
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".csv"],
    },
    maxSize: MAX_FILE_SIZE,
    multiple: false,
  })

  // Handle file rejections
  const fileRejectionItems = fileRejections.map(({ file, errors }) => (
    <div key={file.name} className="text-sm text-destructive">
      {file.name}: {errors.map((e) => e.message).join(", ")}
    </div>
  ))

  const handleImport = async (): Promise<void> => {
    if (!canImport) return

    setStatus("uploading")
    setUploadProgress(0)

    try {
      const response = await fetch(`/api/${storeId}/products/bulk-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeId,
          items: rows,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()

      if (result.success && result.importId) {
        // Start monitoring
        setCurrentImportId(result.importId)
        setMonitoring(true)
        toast.success("Import queued. Processing in background...")
      } else {
        // Fallback for old behavior or error
        setImportResult(result)
        setStatus("completed")
        setUploadProgress(100)
        if (result.success) {
          toast.success(`Successfully imported ${result.processed} products!`)
          onImportSuccess?.()
        } else {
          toast.error(`Import completed with ${result.failed} failures.`)
        }
      }
    } catch (error) {
      console.error("Import error:", error)
      toast.error("Import failed. Please try again or contact support.")
      setStatus("error")
    }
  }

  const handleExportFailedRows = (): void => {
    if (!importResult?.failedRows.length) return

    try {
      exportFailedRowsAsCsv(importResult.failedRows)
      toast.success("Failed rows exported successfully.")
    } catch (error) {
      console.error("Export error:", error)
      toast.error("Failed to export rows. Please try again.")
    }
  }

  const resetImport = (): void => {
    setRows([])
    setValidationErrors([])
    setStatus("idle")
    setUploadProgress(0)
    setImportResult(null)
    setFileName("")
    setShowErrorManagement(false)
    setOriginalRows([])
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleErrorsFixed = (fixedRows: ValidatedProductImportRow[]): void => {
    setRows(prev => [...prev, ...fixedRows])
    setShowErrorManagement(false)
    toast.success(`${fixedRows.length} rows added to import queue`)
  }

  const handleImportSuccess = (): void => {
    setShowErrorManagement(false)
    setRows([])
    setValidationErrors([])
    setOriginalRows([])
    setImportResult(null)
    toast.success("Import completed successfully!")
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Product CSV Import</h1>
        <p className="text-muted-foreground">
          Upload and import your product data from CSV files. Maximum file size: 5MB.
        </p>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud className="h-5 w-5" />
            Upload CSV File
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            {...getRootProps()}
            className={`
              flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg 
              transition-all duration-200 cursor-pointer
              ${isDragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary hover:bg-muted/50"
              }
              ${isLoading ? "pointer-events-none opacity-50" : ""}
            `}
          >
            <input {...getInputProps()} />
            <UploadCloud className="mb-4 h-12 w-12 text-muted-foreground" />
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">{isDragActive ? "Drop your CSV file here" : "Upload CSV File"}</p>
              <p className="text-sm text-muted-foreground">Drag and drop your file here, or click to browse</p>
              <p className="text-xs text-muted-foreground">Supports CSV files up to 5MB</p>
            </div>
          </div>

          {fileRejectionItems.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>File Upload Error</AlertTitle>
              <AlertDescription>
                <div className="space-y-1">{fileRejectionItems}</div>
              </AlertDescription>
            </Alert>
          )}

          {fileName && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{fileName}</span>
              <Button variant="ghost" size="sm" onClick={resetImport} className="ml-auto">
                Remove
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status and Stats */}
      {(rows.length > 0 || hasErrors) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TableIcon className="h-5 w-5" />
              Import Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <div className="p-2 bg-blue-100 rounded-full">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Total Rows</p>
                  <p className="text-2xl font-bold">{stats.totalRows}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <div className="p-2 bg-green-100 rounded-full">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Valid Rows</p>
                  <p className="text-2xl font-bold text-green-600">{stats.validRows}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <div className="p-2 bg-red-100 rounded-full">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Errors</p>
                  <p className="text-2xl font-bold text-red-600">{stats.errorRows}</p>
                </div>
              </div>
            </div>

            {hasErrors && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Validation Errors Found</AlertTitle>
                <AlertDescription>
                  Please fix the following errors before importing:
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    {validationErrors.slice(0, 10).map((error, index) => (
                      <div key={index} className="text-xs">
                        Row {error.row}: {error.field} - {error.message}
                      </div>
                    ))}
                    {validationErrors.length > 10 && (
                      <div className="text-xs font-medium">... and {validationErrors.length - 10} more errors</div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {isLoading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{status === "parsing" ? "Parsing CSV..." : "Importing products..."}</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleImport} disabled={!canImport} className="flex-1">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {status === "parsing" ? "Parsing..." : "Importing..."}
                  </>
                ) : (
                  `Import ${stats.validRows} Products`
                )}
              </Button>

              {rows.length > 0 && (
                <Button variant="outline" onClick={resetImport}>
                  Reset
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Results */}
      {importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {importResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              Import Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Processed:</span>
                  <Badge variant="secondary">{importResult.processed}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Failed:</span>
                  <Badge variant={importResult.failed > 0 ? "destructive" : "secondary"}>{importResult.failed}</Badge>
                </div>
              </div>
            </div>

            {importResult.failed > 0 && importResult.failedRows.length > 0 && (
              <div className="space-y-2">
                <Separator />
                <Button variant="outline" onClick={handleExportFailedRows} className="w-full">
                  <Download className="mr-2 h-4 w-4" />
                  Export Failed Rows ({importResult.failedRows.length})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error Management */}
      {showErrorManagement && (
        <ErrorManagement
          storeId={storeId}
          originalRows={originalRows}
          validationErrors={validationErrors}
          onImportSuccess={handleImportSuccess}
        />
      )}

      {/* Data Preview */}
      {rows.length > 0 && !hasErrors && !showErrorManagement && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TableIcon className="h-5 w-5" />
              Data Preview
              <Badge variant="secondary">First {Math.min(PREVIEW_ROWS, rows.length)} rows</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {rows[0] &&
                        Object.keys(rows[0]).map((key) => (
                          <TableHead key={key} className="font-semibold whitespace-nowrap">
                            {key}
                          </TableHead>
                        ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                      <TableRow key={index}>
                        {Object.values(row).map((value, cellIndex) => (
                          <TableCell key={cellIndex} className="whitespace-nowrap">
                            {String(value)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {rows.length > PREVIEW_ROWS && (
              <p className="text-sm text-muted-foreground mt-2">
                Showing {PREVIEW_ROWS} of {rows.length} rows
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
