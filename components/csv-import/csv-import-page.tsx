"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import Papa from "papaparse"
import { toast } from "react-hot-toast"
import {
  UploadCloud,
  AlertCircle,
  CheckCircle2,
  FileText,
  Download,
  Eye,
  EyeOff,
  Loader2,
  X,
  AlertTriangle,
} from "lucide-react"
import {
  validateProductBatch,
  type ProductImportRow,
  type ValidatedProductImportRow,
} from "@/lib/validation/product-import-schema"
import { exportFailedRowsAsCsv } from "@/lib/utils/export-failed-rows"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Button } from "../ui/button"
import { Alert, AlertDescription, AlertTitle } from "../ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Progress } from "../ui/progress"
import { Badge } from "../ui/badge"
import { Collapsible, CollapsibleContent } from "../ui/collapsible"

interface CsvImportPageProps {
  storeId: string
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

type ImportStep = "upload" | "validate" | "preview" | "import" | "complete"

export default function CsvImportPage({ storeId }: CsvImportPageProps) {
  const [rows, setRows] = useState<ValidatedProductImportRow[]>([])
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [currentStep, setCurrentStep] = useState<ImportStep>("upload")
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setUploadedFile(file)
    setImportResult(null)
    setCurrentStep("validate")

    Papa.parse<ProductImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const { validRows, errors } = validateProductBatch(results.data)
        setRows(validRows)
        setValidationErrors(errors)

        if (errors.length) {
          toast.error(`Found ${errors.length} validation issues`)
          setCurrentStep("upload")
        } else {
          toast.success(`Successfully validated ${validRows.length} rows`)
          setCurrentStep("preview")
        }
      },
      error: ({ message }) => {
        toast.error(`Parsing error: ${message}`)
        setCurrentStep("upload")
      },
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    maxSize: 5 * 1024 * 1024,
    multiple: false,
  })

  const handleImport = async (): Promise<void> => {
    if (!rows.length) return

    setIsUploading(true)
    setCurrentStep("import")
    setUploadProgress(10)

    const interval = setInterval(() => {
      setUploadProgress((p) => Math.min(p + 15, 90))
    }, 300)

    try {
      const res = await fetch(`/api/${storeId}/products/bulk-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, items: rows }),
      })

      clearInterval(interval)
      setUploadProgress(100)
      const result: ImportResult = await res.json()
      setImportResult(result)
      setCurrentStep("complete")

      if (result.success) {
        toast.success(`Successfully imported ${result.processed} products`)
      } else {
        toast.error(`Import completed with ${result.failed} failures`)
      }
    } catch {
      clearInterval(interval)
      toast.error("Import failed. Please try again.")
      setCurrentStep("preview")
    } finally {
      setIsUploading(false)
    }
  }

  const handleExportFailedRows = (): void => {
    if (importResult?.failedRows.length) {
      exportFailedRowsAsCsv(importResult.failedRows)
      toast.success("Failed rows exported successfully")
    }
  }

  const resetImport = () => {
    setRows([])
    setValidationErrors([])
    setImportResult(null)
    setUploadedFile(null)
    setCurrentStep("upload")
    setUploadProgress(0)
    setShowPreview(false)
    setShowErrors(false)
  }

  const hasErrors = validationErrors.length > 0
  const canStart = rows.length > 0 && !hasErrors && !isUploading

  const getStepStatus = (step: ImportStep) => {
    const steps: ImportStep[] = ["upload", "validate", "preview", "import", "complete"]
    const currentIndex = steps.indexOf(currentStep)
    const stepIndex = steps.indexOf(step)

    if (stepIndex < currentIndex) return "complete"
    if (stepIndex === currentIndex) return "current"
    return "pending"
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Product CSV Import</h1>
        <p className="text-muted-foreground">Upload and import your product data from CSV files</p>
      </div>

      {/* Progress Steps */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            {(["upload", "validate", "preview", "import", "complete"] as ImportStep[]).map((step, index) => {
              const status = getStepStatus(step)
              return (
                <div key={step} className="flex items-center">
                  <div className="flex flex-col items-center space-y-2">
                    <div
                      className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
                      ${
                        status === "complete"
                          ? "bg-green-500 text-white"
                          : status === "current"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                      }
                    `}
                    >
                      {status === "complete" ? <CheckCircle2 className="w-5 h-5" /> : index + 1}
                    </div>
                    <span className="text-xs font-medium capitalize">{step}</span>
                  </div>
                  {index < 4 && (
                    <div
                      className={`
                      w-16 h-0.5 mx-4
                      ${status === "complete" ? "bg-green-500" : "bg-muted"}
                    `}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud className="w-5 h-5" />
            Upload CSV File
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!uploadedFile ? (
            <div
              {...getRootProps()}
              className={`
                relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl
                transition-all duration-200 cursor-pointer group
                ${
                  isDragActive
                    ? "border-primary bg-primary/5 scale-[1.02]"
                    : "border-muted-foreground/25 hover:border-primary hover:bg-primary/5"
                }
              `}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center space-y-4">
                <div
                  className={`
                  p-4 rounded-full transition-colors
                  ${isDragActive ? "bg-primary/10" : "bg-muted group-hover:bg-primary/10"}
                `}
                >
                  <UploadCloud
                    className={`
                    w-8 h-8 transition-colors
                    ${isDragActive ? "text-primary" : "text-muted-foreground group-hover:text-primary"}
                  `}
                  />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-lg font-medium">
                    {isDragActive ? "Drop your CSV file here" : "Upload your CSV file"}
                  </p>
                  <p className="text-sm text-muted-foreground">Drag and drop your file here, or click to browse</p>
                  <p className="text-xs text-muted-foreground">Maximum file size: 5MB</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium">{uploadedFile.name}</p>
                  <p className="text-sm text-muted-foreground">{(uploadedFile.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={resetImport}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* File Info */}
          {rows.length > 0 && (
            <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-800 dark:text-green-200">
                  {rows.length} rows ready for import
                </span>
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Validated
              </Badge>
            </div>
          )}

          {/* Validation Errors */}
          {hasErrors && (
            <Alert variant="destructive">
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle className="flex items-center justify-between">
                <span>{validationErrors.length} Validation Issues Found</span>
                <Button variant="ghost" size="sm" onClick={() => setShowErrors(!showErrors)}>
                  {showErrors ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </AlertTitle>
              <AlertDescription>Please review and fix the validation errors before proceeding.</AlertDescription>

              <Collapsible open={showErrors} onOpenChange={setShowErrors}>
                <CollapsibleContent className="mt-4">
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {validationErrors.map((error, index) => (
                      <div key={index} className="p-3 bg-destructive/10 rounded border text-sm">
                        <div className="font-medium">Row {error.row + 1}</div>
                        <div className="text-muted-foreground">
                          <span className="font-medium">{error.field}:</span> {error.message}
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Data Preview */}
      {rows.length > 0 && !hasErrors && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Data Preview
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
                {showPreview ? "Hide Preview" : "Show Preview"}
              </Button>
            </div>
          </CardHeader>

          <Collapsible open={showPreview} onOpenChange={setShowPreview}>
            <CollapsibleContent>
              <CardContent>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        {Object.keys(rows[0]).map((key) => (
                          <TableHead key={key} className="font-semibold">
                            {key}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 5).map((row, idx) => (
                        <TableRow key={idx}>
                          {Object.values(row).map((val, i) => (
                            <TableCell key={i} className="max-w-32 truncate">
                              {String(val)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {rows.length > 5 && (
                  <p className="text-sm text-muted-foreground mt-3 text-center">
                    Showing first 5 rows of {rows.length} total rows
                  </p>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* Import Section */}
      {canStart && (
        <Card>
          <CardHeader>
            <CardTitle>Start Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isUploading && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Importing products...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            <Button onClick={handleImport} disabled={!canStart} className="w-full h-12 text-base">
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing Products...
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4 mr-2" />
                  Import {rows.length} Products
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Import Results */}
      {importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {importResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
              Import Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="text-2xl font-bold text-green-600">{importResult.processed}</div>
                <div className="text-sm text-green-800 dark:text-green-200">Successfully Imported</div>
              </div>

              {importResult.failed > 0 && (
                <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                  <div className="text-2xl font-bold text-red-600">{importResult.failed}</div>
                  <div className="text-sm text-red-800 dark:text-red-200">Failed to Import</div>
                </div>
              )}

              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="text-2xl font-bold text-blue-600">{importResult.processed + importResult.failed}</div>
                <div className="text-sm text-blue-800 dark:text-blue-200">Total Processed</div>
              </div>
            </div>

            {importResult.failed > 0 && (
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleExportFailedRows} className="flex-1">
                  <Download className="w-4 h-4 mr-2" />
                  Export Failed Rows
                </Button>
                <Button onClick={resetImport} className="flex-1">
                  Import Another File
                </Button>
              </div>
            )}

            {importResult.success && (
              <Button onClick={resetImport} className="w-full">
                Import Another File
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}