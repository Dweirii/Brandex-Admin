"use client"

import { useState, useCallback } from "react"
import { useDropzone } from "react-dropzone"
import Papa from "papaparse"
import { toast } from "react-hot-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Upload,
  Download,
  AlertCircle,
  CheckCircle,
  FileText,
  Database,
  TrendingUp,
  AlertTriangle,
  FileCheck,
  Loader2,
} from "lucide-react"
import { productImportSchema, type ProductImportRow } from "@/lib/validation/product-import-schema"
import { exportFailedRowsAsCsv } from "@/lib/utils/export-failed-rows"

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

interface CsvImportPageProps {
  storeId: string
}

export default function CsvImportPage({ storeId }: CsvImportPageProps) {
  const [file, setFile] = useState<File | null>(null)
  const [previewData, setPreviewData] = useState<ProductImportRow[]>([])
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // File drop handler
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const csvFile = acceptedFiles[0]
    if (!csvFile) return

    setFile(csvFile)
    setImportResult(null)

    // Parse CSV for preview
    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as ProductImportRow[]
        const preview = data.slice(0, 10) // First 10 rows
        setPreviewData(preview)

        // Client-side validation
        validateRows(data)
      },
      error: (error) => {
        toast.error(`CSV parsing error: ${error.message}`)
      },
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
    },
    maxSize: 5 * 1024 * 1024, // 5MB
    multiple: false,
  })

  // Client-side validation
  const validateRows = (data: ProductImportRow[]) => {
    const errors: ValidationError[] = []

    data.forEach((row, index) => {
      const result = productImportSchema.safeParse(row)
      if (!result.success) {
        result.error.errors.forEach((error) => {
          errors.push({
            row: index + 1,
            field: error.path.join("."),
            message: error.message,
          })
        })
      }
    })

    setValidationErrors(errors)
  }

  // Enhanced chunked upload with progress simulation
  const handleImport = async () => {
    if (!file) return

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append("file", file)

      // Simulate progress during upload
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval)
            return prev
          }
          return prev + 10
        })
      }, 300)

      const response = await fetch(`/api/${storeId}/products/import`, {
        method: "POST",
        body: formData,
        headers: {
          "X-Requested-With": "XMLHttpRequest", // CSRF protection
        },
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      if (!response.ok) {
        throw new Error(`Import failed: ${response.statusText}`)
      }

      const result: ImportResult = await response.json()
      setImportResult(result)

      if (result.success) {
        toast.success(`Successfully imported ${result.processed} products`)
      } else {
        toast.error(`Import completed with ${result.failed} failures`)
      }
    } catch (error) {
      toast.error("Import failed. Please try again.")
      console.error("Import error:", error)
    } finally {
      setIsUploading(false)
      setTimeout(() => setUploadProgress(0), 1000)
    }
  }

  // Export failed rows
  const handleExportFailedRows = () => {
    if (importResult?.failedRows) {
      exportFailedRowsAsCsv(importResult.failedRows)
      toast.success("Failed rows exported successfully")
    }
  }

  const hasValidationErrors = validationErrors.length > 0
  const canImport = file && !hasValidationErrors && !isUploading

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Database className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Import Products</h1>
              <p className="text-gray-600 mt-1">Upload and validate your product data from CSV files</p>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="border-0 shadow-sm bg-white/70 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">File Format</p>
                    <p className="text-lg font-semibold text-gray-900">CSV Only</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-white/70 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Max File Size</p>
                    <p className="text-lg font-semibold text-gray-900">5 MB</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-white/70 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-purple-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">Max Rows</p>
                    <p className="text-lg font-semibold text-gray-900">10,000</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Upload Zone */}
        <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm mb-8">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Upload className="h-5 w-5 text-blue-600" />
              Upload CSV File
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300 ${
                isDragActive
                  ? "border-blue-400 bg-blue-50 scale-[1.02]"
                  : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/50"
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-4">
                <div className={`p-4 rounded-full transition-colors ${isDragActive ? "bg-blue-100" : "bg-gray-100"}`}>
                  <Upload className={`h-8 w-8 transition-colors ${isDragActive ? "text-blue-600" : "text-gray-400"}`} />
                </div>

                {isDragActive ? (
                  <div className="space-y-2">
                    <p className="text-xl font-medium text-blue-600">Drop the CSV file here</p>
                    <p className="text-sm text-blue-500">Release to upload</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xl font-medium text-gray-700">Drag & drop your CSV file here</p>
                    <p className="text-gray-500">or click to browse files</p>
                    <div className="flex items-center gap-2 justify-center mt-4">
                      <Badge variant="secondary" className="text-xs">
                        CSV files only
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        Max 5MB
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {file && (
              <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <div className="flex items-center gap-3">
                  <FileCheck className="h-5 w-5 text-green-600" />
                  <div className="flex-1">
                    <p className="font-medium text-green-800">{file.name}</p>
                    <p className="text-sm text-green-600">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                  <Badge className="bg-green-100 text-green-800 border-green-200">Ready</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Validation Errors */}
        {hasValidationErrors && (
          <Alert variant="destructive" className="mb-8 border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-red-800">
              <span className="font-medium">
                Found {validationErrors.length} validation error{validationErrors.length !== 1 ? "s" : ""}
              </span>
              <br />
              Please review and fix the highlighted issues before importing.
            </AlertDescription>
          </Alert>
        )}

        {/* Preview Table */}
        {previewData.length > 0 && (
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm mb-8">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Data Preview
                  <Badge variant="outline" className="ml-2">
                    First 10 rows
                  </Badge>
                </CardTitle>
                <div className="flex items-center gap-2">
                  {hasValidationErrors ? (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {validationErrors.length} errors
                    </Badge>
                  ) : (
                    <Badge
                      variant="default"
                      className="bg-green-100 text-green-800 border-green-200 flex items-center gap-1"
                    >
                      <CheckCircle className="h-3 w-3" />
                      Valid
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Row</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Price</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Category ID</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {previewData.map((row, index) => {
                      const rowErrors = validationErrors.filter((e) => e.row === index + 1)
                      const hasError = rowErrors.length > 0

                      return (
                        <tr
                          key={index}
                          className={`transition-colors ${
                            hasError ? "bg-red-50 hover:bg-red-100" : "hover:bg-gray-50"
                          }`}
                        >
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{index + 1}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">{row.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">${row.price}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 font-mono ">{row.categoryId}</td>
                          <td className="px-4 py-3">
                            {hasError ? (
                              <div className="flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                                <div className="text-xs text-red-600 space-y-1">
                                  {rowErrors.map((error, i) => (
                                    <div key={i} className="font-medium">
                                      {error.field}: {error.message}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="text-xs text-green-600 font-medium">Valid</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Import Progress */}
        {isUploading && (
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm mb-8">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                    <span className="font-medium text-gray-900">Importing products...</span>
                  </div>
                  <span className="text-sm font-medium text-gray-600">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-sm text-gray-500">
                  Processing your data in secure batches. Please don&apos;t close this page.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Import Results */}
        {importResult && (
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm mb-8">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-xl">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Import Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="text-center p-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200">
                    <div className="flex items-center justify-center mb-3">
                      <div className="p-3 bg-green-100 rounded-full">
                        <CheckCircle className="h-6 w-6 text-green-600" />
                      </div>
                    </div>
                    <p className="text-3xl font-bold text-green-700 mb-1">{importResult.processed}</p>
                    <p className="text-sm font-medium text-green-600">Successfully Imported</p>
                  </div>

                  <div className="text-center p-6 bg-gradient-to-br from-red-50 to-rose-50 rounded-xl border border-red-200">
                    <div className="flex items-center justify-center mb-3">
                      <div className="p-3 bg-red-100 rounded-full">
                        <AlertTriangle className="h-6 w-6 text-red-600" />
                      </div>
                    </div>
                    <p className="text-3xl font-bold text-red-700 mb-1">{importResult.failed}</p>
                    <p className="text-sm font-medium text-red-600">Failed</p>
                  </div>
                </div>

                {importResult.failed > 0 && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between p-4 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        <div>
                          <p className="font-medium text-amber-800">Some rows failed to import</p>
                          <p className="text-sm text-amber-600">Download the failed rows to review and fix issues</p>
                        </div>
                      </div>
                      <Button
                        onClick={handleExportFailedRows}
                        variant="outline"
                        className="border-amber-300 text-amber-700 hover:bg-amber-100"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Export Failed Rows
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Button
            onClick={handleImport}
            disabled={!canImport}
            size="lg"
            className="flex-1 h-12 text-base font-medium bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Database className="h-5 w-5 mr-2" />
                Import Products
              </>
            )}
          </Button>

          {file && (
            <Button
              variant="outline"
              size="lg"
              className="h-12 text-base font-medium border-gray-300 hover:bg-gray-50"
              onClick={() => {
                setFile(null)
                setPreviewData([])
                setValidationErrors([])
                setImportResult(null)
              }}
            >
              Clear File
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
