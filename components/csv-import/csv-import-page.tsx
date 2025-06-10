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
  Info,
  BookOpen,
  Target,
  Shield,
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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const csvFile = acceptedFiles[0]
    if (!csvFile) return

    setFile(csvFile)
    setImportResult(null)

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as ProductImportRow[]
        const preview = data.slice(0, 10)
        setPreviewData(preview)

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
    maxSize: 5 * 1024 * 1024,
    multiple: false,
  })

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

  const handleImport = async () => {
    if (!file) return

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append("file", file)

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
          "X-Requested-With": "XMLHttpRequest",
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

  const handleExportFailedRows = () => {
    if (importResult?.failedRows) {
      exportFailedRowsAsCsv(importResult.failedRows)
      toast.success("Failed rows exported successfully")
    }
  }

  const hasValidationErrors = validationErrors.length > 0
  const canImport = file && !hasValidationErrors && !isUploading

  return (
    <div className="min-h-screen ">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-[#171717] rounded-xl shadow-lg">
              <Database className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-200 bg-clip-text text-transparent">
                Import Products
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-2 text-lg">
                Upload and validate your product data from CSV files
              </p>
            </div>
          </div>

          {/* Instructions Section */}
          <Card className="mb-8 border-0 shadow-lg bg-[#171717] backdrop-blur-sm">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-xl text-slate-900 dark:text-white">
                <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                How to Import Products
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">1</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Prepare Your CSV</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Ensure your CSV includes required columns: name, price, categoryId. Optional: description, images,
                      inventory.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-green-600 dark:text-green-400">2</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Upload & Validate</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Drop your CSV file or click to browse. We&apos;ll automatically validate your data and show a preview.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/50 rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold text-purple-600 dark:text-purple-400">3</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Import Products</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Review the preview, fix any errors, then click Import to add products to your store.
                    </p>
                  </div>
                </div>
              </div>

              <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertDescription className="text-blue-800 dark:text-blue-200">
                  <strong>Pro Tip:</strong> Download our CSV template to ensure your data is formatted correctly. Make
                  sure all required fields are filled and prices are in decimal format (e.g., 29.99).
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="border-0 shadow-lg bg-[#171717] backdrop-blur-sm hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">File Format</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">CSV Only</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-[#171717] backdrop-blur-sm hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-lg">
                    <Target className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Max File Size</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">5 MB</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg bg-[#171717] backdrop-blur-sm hover:shadow-xl transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Max Rows</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">10,000</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Upload Zone */}
        <Card className="border-0 shadow-xl bg-[#171717] backdrop-blur-sm mb-8">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl text-slate-900 dark:text-white">
              <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Upload CSV File
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300 ${
                isDragActive
                  ? "border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-950/50 scale-[1.02] shadow-lg"
                  : "border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/30"
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-4">
                <div
                  className={`p-4 rounded-full transition-all duration-300 ${
                    isDragActive ? "bg-blue-100 dark:bg-blue-900/50 scale-110" : "bg-slate-100 dark:bg-slate-700"
                  }`}
                >
                  <Upload
                    className={`h-8 w-8 transition-colors ${
                      isDragActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"
                    }`}
                  />
                </div>

                {isDragActive ? (
                  <div className="space-y-2">
                    <p className="text-xl font-medium text-blue-600 dark:text-blue-400">Drop the CSV file here</p>
                    <p className="text-sm text-blue-500 dark:text-blue-300">Release to upload</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xl font-medium text-slate-700 dark:text-slate-200">
                      Drag & drop your CSV file here
                    </p>
                    <p className="text-slate-500 dark:text-slate-400">or click to browse files</p>
                    <div className="flex items-center gap-2 justify-center mt-4">
                      <Badge
                        variant="secondary"
                        className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                      >
                        CSV files only
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                      >
                        Max 5MB
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {file && (
              <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-3">
                  <FileCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <div className="flex-1">
                    <p className="font-medium text-green-800 dark:text-green-200">{file.name}</p>
                    <p className="text-sm text-green-600 dark:text-green-400">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                  <Badge className="bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 border-green-200 dark:border-green-700">
                    Ready
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Validation Errors */}
        {hasValidationErrors && (
          <Alert variant="destructive" className="mb-8 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-red-800 dark:text-red-200">
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
          <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm mb-8">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-xl text-slate-900 dark:text-white">
                  <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Data Preview
                  <Badge
                    variant="outline"
                    className="ml-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
                  >
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
                    <Badge className="bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 border-green-200 dark:border-green-700 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Valid
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-700 border-b border-slate-200 dark:border-slate-600">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Row
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Price
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Category ID
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {previewData.map((row, index) => {
                      const rowErrors = validationErrors.filter((e) => e.row === index + 1)
                      const hasError = rowErrors.length > 0

                      return (
                        <tr
                          key={index}
                          className={`transition-colors ${
                            hasError
                              ? "bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50"
                              : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                          }`}
                        >
                          <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                            {index + 1}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 max-w-xs truncate">
                            {row.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">${row.price}</td>
                          <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 font-mono">
                            {row.categoryId}
                          </td>
                          <td className="px-4 py-3">
                            {hasError ? (
                              <div className="flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" />
                                <div className="text-xs text-red-600 dark:text-red-400 space-y-1">
                                  {rowErrors.map((error, i) => (
                                    <div key={i} className="font-medium">
                                      {error.field}: {error.message}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />
                                <span className="text-xs text-green-600 dark:text-green-400 font-medium">Valid</span>
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
          <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm mb-8">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-slate-900 dark:text-white">Importing products...</span>
                  </div>
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Processing your data in secure batches. Please don&apos;t close this page.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Import Results */}
        {importResult && (
          <Card className="border-0 shadow-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm mb-8">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-xl text-slate-900 dark:text-white">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                Import Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="text-center p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/50 rounded-xl border border-green-200 dark:border-green-800">
                    <div className="flex items-center justify-center mb-3">
                      <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-full">
                        <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                      </div>
                    </div>
                    <p className="text-3xl font-bold text-green-700 dark:text-green-300 mb-1">
                      {importResult.processed}
                    </p>
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">Successfully Imported</p>
                  </div>

                  <div className="text-center p-6 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/50 dark:to-rose-950/50 rounded-xl border border-red-200 dark:border-red-800">
                    <div className="flex items-center justify-center mb-3">
                      <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-full">
                        <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                      </div>
                    </div>
                    <p className="text-3xl font-bold text-red-700 dark:text-red-300 mb-1">{importResult.failed}</p>
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">Failed</p>
                  </div>
                </div>

                {importResult.failed > 0 && (
                  <>
                    <Separator className="dark:bg-slate-700" />
                    <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-950/50 rounded-lg border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        <div>
                          <p className="font-medium text-amber-800 dark:text-amber-200">Some rows failed to import</p>
                          <p className="text-sm text-amber-600 dark:text-amber-400">
                            Download the failed rows to review and fix issues
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={handleExportFailedRows}
                        variant="outline"
                        className="border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/50"
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
            className="flex-1 h-12 text-base font-medium bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 dark:from-blue-500 dark:to-blue-600 dark:hover:from-blue-600 dark:hover:to-blue-700 shadow-lg hover:shadow-xl transition-all"
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
              className="h-12 text-base font-medium border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
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
