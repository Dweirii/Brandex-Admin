"use client"

import { useState } from "react"
import { toast } from "react-hot-toast"
import { Wand2, Image as ImageIcon, Download, Upload, Loader2, Plus, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface CsvMakerPageProps {
  storeId: string
  categories: { id: string; name: string }[]
  onImportSuccess?: () => void
}

interface GeneratedProduct {
  name: string
  description: string
  imageUrl: string
  downloadUrl: string
  price: string
  categoryId: string
  keywords?: string[]
}

export default function CsvMakerPage({ storeId, categories, onImportSuccess }: CsvMakerPageProps) {
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [currentUrl, setCurrentUrl] = useState("")
  const [bulkUrls, setBulkUrls] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("")
  const [price, setPrice] = useState<string>("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedProducts, setGeneratedProducts] = useState<GeneratedProduct[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [useBulkInput, setUseBulkInput] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<"pending" | "processing" | "completed" | "failed" | null>(null)

  const addImageUrl = () => {
    if (!currentUrl.trim()) {
      toast.error("Please enter an image URL")
      return
    }

    if (!currentUrl.match(/^https?:\/\/.+/)) {
      toast.error("Please enter a valid URL starting with http:// or https://")
      return
    }

    if (imageUrls.includes(currentUrl)) {
      toast.error("This URL is already added")
      return
    }

    setImageUrls([...imageUrls, currentUrl.trim()])
    setCurrentUrl("")
    toast.success("Image URL added")
  }

  const addBulkUrls = () => {
    if (!bulkUrls.trim()) {
      toast.error("Please enter URLs")
      return
    }

    // Parse URLs more carefully - handle different formats
    // Priority: newlines > commas > spaces
    let urls: string[] = []
    
    // Method 1: Split by newlines (most common for bulk paste from file)
    // Handle both \n, \r\n, and \r
    if (bulkUrls.includes('\n') || bulkUrls.includes('\r')) {
      urls = bulkUrls.split(/\r?\n|\r/)
    } 
    // Method 2: Split by commas (CSV format)
    else if (bulkUrls.includes(',')) {
      urls = bulkUrls.split(',')
    }
    // Method 3: Split by any whitespace (space, tab, etc.)
    // URLs shouldn't contain unencoded spaces, so this is safe
    else {
      urls = bulkUrls.split(/\s+/)
    }
    
    console.log(`[CSV Maker] Parsed ${urls.length} potential URLs from input`)

    // Clean and validate URLs - be more permissive
    const validUrls = urls
      .map((url) => url.trim())
      .filter((url) => {
        // Must not be empty
        if (!url || url.length === 0) return false
        // Must start with http:// or https:// (case insensitive)
        const urlLower = url.toLowerCase().trim()
        if (!urlLower.startsWith('http://') && !urlLower.startsWith('https://')) return false
        // Basic URL validation - must have at least http:// and something after
        if (url.trim().length < 10) return false // http://a.co is minimum
        return true
      })
      .map(url => url.trim()) // Final trim

    console.log(`[CSV Maker] Found ${validUrls.length} valid URLs out of ${urls.length} parsed`)

    if (validUrls.length === 0) {
      toast.error("No valid URLs found. URLs must start with http:// or https://")
      return
    }

    // Remove duplicates (case-insensitive, preserve original case)
    const existingUrlsLower = new Set(imageUrls.map(url => url.toLowerCase().trim()))
    const urlMap = new Map<string, string>() // lowercase -> original case
    
    validUrls.forEach(url => {
      const trimmedUrl = url.trim()
      const urlLower = trimmedUrl.toLowerCase()
      // Only add if not already in existing URLs and not already in the new batch
      if (!existingUrlsLower.has(urlLower) && !urlMap.has(urlLower)) {
        urlMap.set(urlLower, trimmedUrl)
      }
    })

    const uniqueNewUrls = Array.from(urlMap.values())
    console.log(`[CSV Maker] Adding ${uniqueNewUrls.length} new unique URLs (${validUrls.length - uniqueNewUrls.length} duplicates/invalid skipped)`)

    // Combine with existing URLs
    const allUrls = [...imageUrls, ...uniqueNewUrls]
    setImageUrls(allUrls)
    setBulkUrls("")
    
    const duplicatesSkipped = validUrls.length - uniqueNewUrls.length
    const totalParsed = urls.length
    const invalidSkipped = totalParsed - validUrls.length
    
    let message = `Added ${uniqueNewUrls.length} URLs. Total: ${allUrls.length}`
    if (duplicatesSkipped > 0 || invalidSkipped > 0) {
      const parts: string[] = []
      if (duplicatesSkipped > 0) parts.push(`${duplicatesSkipped} duplicates`)
      if (invalidSkipped > 0) parts.push(`${invalidSkipped} invalid`)
      message += ` (${parts.join(', ')} skipped)`
    }
    
    toast.success(message)
  }

  const removeImageUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index))
  }

  const generateProducts = async () => {
    if (imageUrls.length === 0) {
      toast.error("Please add at least one image URL")
      return
    }

    if (!selectedCategory) {
      toast.error("Please select a category")
      return
    }

    // Handle "free" as 0
    const normalizedPrice = price.toLowerCase().trim()
    const priceValue = normalizedPrice === "free" ? 0 : Number.parseFloat(price)
    
    if (price === "" || (normalizedPrice !== "free" && isNaN(priceValue))) {
      toast.error("Please enter a valid price (number or 'free')")
      return
    }

    if (priceValue < 0 || priceValue > 999999.99) {
      toast.error("Price must be between 0 and 999,999.99")
      return
    }

    setIsGenerating(true)
    setGeneratedProducts([])
    setProgress({ current: 0, total: imageUrls.length })
    setJobId(null)
    setJobStatus(null)

    try {
      // Use Inngest for large batches (100+ URLs) to avoid timeouts
      const USE_INNGEST_THRESHOLD = 100
      const shouldUseInngest = imageUrls.length >= USE_INNGEST_THRESHOLD

      if (shouldUseInngest) {
        // Queue job to Inngest
        const response = await fetch(`/api/${storeId}/products/generate-from-images`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageUrls,
            categoryId: selectedCategory,
            price: priceValue,
            useInngest: true,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || "Failed to queue job")
        }

        const data = await response.json()
        const currentJobId = data.jobId

        if (!currentJobId) {
          throw new Error("No job ID returned")
        }

        setJobId(currentJobId)
        setJobStatus("pending")
        toast.success(`Job queued! Processing ${imageUrls.length} images in the background...`)

        // Poll for job status
        const pollInterval = setInterval(async () => {
          try {
            const statusResponse = await fetch(
              `/api/${storeId}/products/generate-job-status?jobId=${currentJobId}`
            )

            if (!statusResponse.ok) {
              // Job might not exist yet (timing issue) or might be in a different process
              // Don't spam errors, just silently continue polling
              if (statusResponse.status === 404) {
                console.log(`Job ${currentJobId} not found yet, waiting...`)
                return
              }
              console.error(`Failed to fetch job status: ${statusResponse.status}`)
              return
            }

            const statusData = await statusResponse.json()
            setJobStatus(statusData.status)
            setProgress({
              current: statusData.processed || 0,
              total: statusData.total || imageUrls.length,
            })

            if (statusData.status === "completed") {
              clearInterval(pollInterval)
              setGeneratedProducts(statusData.products || [])
              setIsGenerating(false)
              toast.success(
                `Successfully generated ${statusData.processed || 0} out of ${imageUrls.length} products!`
              )
            } else if (statusData.status === "failed") {
              clearInterval(pollInterval)
              setIsGenerating(false)
              toast.error(statusData.error || "Job failed")
            }
          } catch (error) {
            console.error("Error polling job status:", error)
          }
        }, 2000) // Poll every 2 seconds

        // Cleanup interval after 30 minutes (safety timeout)
        setTimeout(() => {
          clearInterval(pollInterval)
          const finalStatus = jobStatus
          if (finalStatus !== "completed" && finalStatus !== "failed") {
            toast("Job is still processing. Check back later or refresh the page.")
          }
        }, 30 * 60 * 1000)

        return
      }

      // For smaller batches, process directly
      const BATCH_SIZE = 10
      const batches: string[][] = []
      
      for (let i = 0; i < imageUrls.length; i += BATCH_SIZE) {
        batches.push(imageUrls.slice(i, i + BATCH_SIZE))
      }

      const allProducts: GeneratedProduct[] = []

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]
        setProgress({ current: batchIndex * BATCH_SIZE, total: imageUrls.length })

        try {
          const response = await fetch(`/api/${storeId}/products/generate-from-images`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              imageUrls: batch,
              categoryId: selectedCategory,
              price: priceValue,
            }),
          })

          if (!response.ok) {
            const error = await response.json()
            console.error(`Batch ${batchIndex + 1} failed:`, error)
            continue
          }

          const data = await response.json()
          allProducts.push(...data.products)
          setGeneratedProducts([...allProducts])
          
          if (data.failed && data.failed > 0) {
            console.warn(`Batch ${batchIndex + 1}: ${data.failed} images failed to process`)
          }
          
          if (batchIndex < batches.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
        } catch (error) {
          console.error(`Error processing batch ${batchIndex + 1}:`, error)
          continue
        }
      }

      setProgress({ current: imageUrls.length, total: imageUrls.length })
      
      if (allProducts.length === 0) {
        toast.error("Failed to generate any products. Please check your URLs and try again.")
      } else {
        toast.success(`Successfully generated ${allProducts.length} out of ${imageUrls.length} products!`)
      }
    } catch (error) {
      console.error("Generation error:", error)
      toast.error(error instanceof Error ? error.message : "Failed to generate products")
    } finally {
      setIsGenerating(false)
      if (!jobId) {
        // Only reset progress if not using Inngest
        setProgress({ current: 0, total: 0 })
      }
    }
  }

  const downloadCSV = () => {
    if (generatedProducts.length === 0) {
      toast.error("No products to export")
      return
    }

    const headers = ["name", "description", "price", "categoryId", "downloadUrl", "imageUrl", "isFeatured", "isArchived", "keywords"]
    const rows = generatedProducts.map((product) => [
      product.name,
      product.description || "",
      product.price,
      product.categoryId,
      product.downloadUrl,
      product.imageUrl,
      "false",
      "false",
      product.keywords?.join(",") || "",
    ])

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `products-${Date.now()}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast.success("CSV file downloaded successfully!")
  }

  const importDirectly = async () => {
    if (generatedProducts.length === 0) {
      toast.error("No products to import")
      return
    }

    setIsImporting(true)

    try {
      const response = await fetch(`/api/${storeId}/products/bulk-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeId,
          items: generatedProducts.map((p) => ({
            ...p,
            isFeatured: false,
            isArchived: false,
            keywords: p.keywords || [],
          })),
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to import products")
      }

      const result = await response.json()
      toast.success(`Successfully imported ${result.processed || generatedProducts.length} products!`)
      setGeneratedProducts([])
      setImageUrls([])
      onImportSuccess?.()
    } catch (error) {
      console.error("Import error:", error)
      toast.error("Failed to import products. Please try again.")
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Wand2 className="h-8 w-8 text-primary" />
          CSV Maker with AI Vision
        </h1>
        <p className="text-muted-foreground">
          Generate product data from images using OpenAI Vision API. Add image URLs, select category and price, then generate CSV or import directly.
        </p>
      </div>

      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle>Product Generation Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Image URLs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Image URLs</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUseBulkInput(!useBulkInput)}
                type="button"
              >
                {useBulkInput ? "Single Input" : "Bulk Input"}
              </Button>
            </div>

            {useBulkInput ? (
              <div className="space-y-2">
                <Textarea
                  placeholder="Paste URLs here (one per line, or separated by commas/spaces)&#10;https://example.com/image1.jpg&#10;https://example.com/image2.jpg&#10;..."
                  value={bulkUrls}
                  onChange={(e) => setBulkUrls(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                />
                <Button onClick={addBulkUrls} type="button" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add All URLs
                </Button>
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    // Count valid URLs for preview - use same logic as addBulkUrls
                    if (!bulkUrls.trim()) return 'Paste URLs (one per line, or comma-separated)'
                    
                    let urls: string[] = []
                    if (bulkUrls.includes('\n') || bulkUrls.includes('\r')) {
                      urls = bulkUrls.split(/\r?\n|\r/)
                    } else if (bulkUrls.includes(',')) {
                      urls = bulkUrls.split(',')
                    } else {
                      urls = bulkUrls.split(/\s+/)
                    }
                    
                    const validCount = urls
                      .map(url => url.trim())
                      .filter(url => {
                        if (!url || url.length === 0) return false
                        const urlLower = url.toLowerCase()
                        return (urlLower.startsWith('http://') || urlLower.startsWith('https://')) && url.length >= 10
                      }).length
                    
                    return validCount > 0 ? `${validCount} valid URLs detected` : 'Paste URLs (one per line, or comma-separated)'
                  })()}
                </p>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com/image.jpg"
                  value={currentUrl}
                  onChange={(e) => setCurrentUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addImageUrl()
                    }
                  }}
                />
                <Button onClick={addImageUrl} type="button">
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            )}

            {imageUrls.length > 0 && (
              <div className="space-y-2 mt-4">
                <Label className="text-sm">Added Images ({imageUrls.length})</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                  {imageUrls.map((url, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                      <span className="text-sm truncate flex-1 mr-2">{url}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeImageUrl(index)}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Category Selection */}
          <div className="space-y-2">
            <Label>Category *</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price */}
          <div className="space-y-2">
            <Label>Price *</Label>
            <Input
              type="text"
              placeholder="29.99 or 'free'"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enter a number (e.g., 29.99) or &quot;free&quot; for free products. Price will be applied to all generated products.
            </p>
          </div>

          {/* Progress Bar */}
          {isGenerating && progress.total > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {jobStatus === "pending" && "Job queued, starting processing..."}
                  {jobStatus === "processing" && "Processing images in background..."}
                  {!jobStatus && "Processing images..."}
                </span>
                <span>
                  {progress.current} / {progress.total} ({Math.round((progress.current / progress.total) * 100)}%)
                </span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              {jobId && (
                <Alert>
                  <AlertDescription className="text-xs">
                    <strong>Job ID:</strong> {jobId}
                    <br />
                    {jobStatus === "pending" || jobStatus === "processing" ? (
                      <span className="text-muted-foreground">
                        Processing in background. You can close this page and check back later.
                      </span>
                    ) : null}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Generate Button */}
          <Button onClick={generateProducts} disabled={isGenerating || imageUrls.length === 0} className="w-full">
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Products... ({progress.current}/{progress.total})
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Generate Products from {imageUrls.length} Image{imageUrls.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated Products */}
      {generatedProducts.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Generated Products ({generatedProducts.length})</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" onClick={downloadCSV}>
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV
                </Button>
                <Button onClick={importDirectly} disabled={isImporting}>
                  {isImporting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Import Directly
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Image</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {generatedProducts.map((product, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{product.name}</TableCell>
                        <TableCell className="max-w-md truncate">{product.description}</TableCell>
                        <TableCell>${product.price}</TableCell>
                        <TableCell>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-16 h-16 object-cover rounded"
                            onError={(e) => {
                              e.currentTarget.src = "/placeholder-image.png"
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Alert */}
      <Alert>
        <ImageIcon className="h-4 w-4" />
        <AlertDescription>
          <strong>How it works:</strong> Add image URLs, select a category and set a price. The AI will analyze each image and generate product name, description, and keywords. The downloadUrl will be set to the same as imageUrl. You can then download as CSV or import directly to your store.
        </AlertDescription>
      </Alert>
    </div>
  )
}

