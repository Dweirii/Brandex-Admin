"use client"

import type React from "react"
import type { Category, Image as ImageType, Product } from "@prisma/client" // Assuming ImageType is from Prisma
import { Button } from "@/components/ui/button"
import { Heading } from "@/components/ui/heading"
import { Separator } from "@/components/ui/separator"
import * as z from "zod"
import {
  Trash,
  X,
  ArrowLeft,
  DollarSign,
  Tag,
  Moon,
  Sun,
  ImageIcon,
  FileDown,
  FileText,
  PlusCircle,
} from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import toast from "react-hot-toast"
import axios from "axios"
import { useParams, useRouter } from "next/navigation"
import { AleartModal } from "@/components/modals/alert-modal"
import { Card, CardContent } from "@/components/ui/card"
import { useMobile } from "@/hooks/use-mobile"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import Image from "next/image"
import { useTheme } from "next-themes"
import { Badge } from "@/components/ui/badge"

const formSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().optional(),
  image: z
    .array(z.object({ url: z.string().url("Please enter a valid URL") }))
    .min(1, "At least one image is required"),
  price: z.coerce.number().min(0.01, "Price must be greater than 0"),
  downloadUrl: z.string().optional(),
  categoryId: z.string().min(1, "Category is required"),
  keywords: z.array(z.string().min(1, "Keyword cannot be empty")).min(1, "At least one keyword is required"),
  isFeatured: z.boolean().default(false),
  isArchived: z.boolean().default(false),
})

type ProductFormValues = z.infer<typeof formSchema>

interface ProductFormProps {
  initialData:
    | (Product & {
        Image: ImageType[] // Prisma's Image type
      })
    | null
  categories: Category[]
}

export const ProductForm: React.FC<ProductFormProps> = ({ initialData, categories }) => {
  // State management
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [imageUrl, setImageUrl] = useState("")
  const [currentKeyword, setCurrentKeyword] = useState("")

  // Hooks
  const params = useParams()
  const router = useRouter()
  const isMobile = useMobile()
  const { setTheme, theme } = useTheme()

  // UI text variables
  const title = initialData ? "Edit Product" : "Create Product"
  const descriptionText = initialData ? "Make changes to your product" : "Add a new product to your store"
  const toastMessage = initialData ? "Product updated successfully" : "Product created successfully"
  const action = initialData ? "Save changes" : "Create product"

  // Form initialization
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          ...initialData,
          price: Number.parseFloat(String(initialData?.price)),
          image: initialData.Image ? initialData.Image.map((img) => ({ url: img.url })) : [],
          description: initialData.description || "",
          downloadUrl: initialData.downloadUrl || "",
          keywords: initialData.keywords || [],
        }
      : {
          name: "",
          description: "",
          image: [],
          price: 0,
          downloadUrl: "",
          categoryId: "",
          keywords: [],
          isFeatured: false,
          isArchived: false,
        },
  })

  const onSubmit = async (data: ProductFormValues) => {
    try {
      setLoading(true)
      // The 'image' field in 'data' is already {url: string}[] thanks to Zod and form state
      const payload = {
        ...data,
        Image: data.image, // Ensure payload structure matches API expectation if it needs Image property
      }

      if (initialData) {
        await axios.patch(`/api/${params.storeId}/products/${params.productId}`, payload)
      } else {
        await axios.post(`/api/${params.storeId}/products`, payload)
      }

      toast.success(toastMessage)
      router.refresh()
      router.push(`/${params.storeId}/products`)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        toast.error("A product with this name already exists. Please choose a different name.")
      } else {
        toast.error("Something went wrong. Please try again.")
      }
      console.error("Form submission error:", error)
    } finally {
      setLoading(false)
    }
  }

  // Delete handler
  const onDelete = async () => {
    try {
      setLoading(true)
      await axios.delete(`/api/${params.storeId}/products/${params.productId}`)
      router.refresh()
      router.push(`/${params.storeId}/products`)
      toast.success("Product deleted successfully")
    } catch {
      toast.error("Make sure you removed all items using this product first")
    } finally {
      setLoading(false)
      setOpen(false)
    }
  }

  // Watch form values
  const images = form.watch("image")

  // Image handlers
  const handleRemoveImage = (index: number) => {
    const currentImages = [...images]
    currentImages.splice(index, 1)
    form.setValue("image", currentImages, { shouldValidate: true })
  }

  const handleAddImage = () => {
    if (!imageUrl.trim()) {
      toast.error("Please enter an image URL")
      return
    }
    try {
      // Basic URL validation before adding
      new URL(imageUrl)
      const currentImages = [...images]
      currentImages.push({ url: imageUrl })
      form.setValue("image", currentImages, { shouldValidate: true })
      setImageUrl("")
      toast.success("Image URL added successfully")
    } catch {
      toast.error("Please enter a valid image URL.")
    }
  }

  // Keywords handlers
  const handleAddKeyword = () => {
    const trimmedKeyword = currentKeyword.trim()
    if (trimmedKeyword) {
      const currentKeywords = form.getValues("keywords")
      if (!currentKeywords.includes(trimmedKeyword)) {
        form.setValue("keywords", [...currentKeywords, trimmedKeyword], { shouldValidate: true })
        setCurrentKeyword("")
      } else {
        toast.error("Keyword already added.")
        setCurrentKeyword("") 
      }
    }
  }

  const handleRemoveKeyword = (keywordToRemove: string) => {
    const currentKeywords = form.getValues("keywords")
    form.setValue(
      "keywords",
      currentKeywords.filter((kw) => kw !== keywordToRemove),
      { shouldValidate: true },
    )
  }

  const handleKeywordInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      handleAddKeyword()
    }
  }

  return (
    <>
      <AleartModal isOpen={open} onClose={() => setOpen(false)} onConfirm={onDelete} loading={loading} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-y-4 sm:gap-y-0">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="mr-2 md:hidden"
            onClick={() => router.push(`/${params.storeId}/products`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Heading title={title} description={descriptionText} />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-full"
          >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
          {initialData && (
            <Button
              disabled={loading}
              variant="destructive"
              size={isMobile ? "default" : "sm"}
              onClick={() => setOpen(true)}
            >
              <Trash className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
        </div>
      </div>
      <Separator className="my-4" />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 w-full pb-24 md:pb-10">
          <div className="space-y-8 w-full">
            <Card className="border border-border bg-card shadow-sm">
              <CardContent className="pt-6">
                <h3 className="text-lg font-medium mb-4">Basic Information</h3>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">Name</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                              <Input
                                disabled={loading}
                                placeholder="Product Name"
                                {...field}
                                className="h-12 text-base pl-10 bg-background border-input"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">Price</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                              <Input
                                type="number"
                                step="0.01"
                                disabled={loading}
                                placeholder="9.99"
                                {...field}
                                className="h-12 text-base pl-10 bg-background border-input"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="categoryId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">Category</FormLabel>
                          <Select
                            disabled={loading}
                            onValueChange={field.onChange}
                            value={field.value}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="h-12 bg-background border-input">
                                <SelectValue defaultValue={field.value} placeholder="Select a category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {categories.map((category) => (
                                <SelectItem key={category.id} value={category.id}>
                                  {category.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base">Description</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <FileText className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                              <Textarea
                                disabled={loading}
                                placeholder="Product description..."
                                {...field}
                                className="min-h-[164px] pt-3 pl-10 bg-background border-input resize-none text-base"
                              />
                            </div>
                          </FormControl>
                          <FormDescription>Optional product description.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border bg-card shadow-sm">
              <CardContent className="pt-6">
                <h3 className="text-lg font-medium mb-4">Product Images</h3>
                <div className="space-y-6">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <FormLabel className="text-base">Add Image URL</FormLabel>
                      <div className="flex flex-col gap-2">
                        <div className="relative flex items-center">
                          <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            placeholder="https://example.com/your-image.jpg"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            className="h-12 pl-10 pr-28 bg-background border-input text-base" // Increased pr for button
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                handleAddImage()
                              }
                            }}
                            disabled={loading}
                          />
                          <Button
                            type="button"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-10 px-3"
                            onClick={handleAddImage}
                            disabled={loading || !imageUrl.trim()}
                          >
                            <PlusCircle className="h-4 w-4 mr-2 sm:mr-0 md:mr-2" />{" "}
                            <span className="hidden sm:inline md:hidden lg:inline">Add</span>
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Paste the direct URL to your image. Press Enter or click Add.
                        </p>
                      </div>
                    </div>

                    <div>
                      <FormLabel className="text-base mb-2 block">
                        Uploaded Images {images.length > 0 && `(${images.length})`}
                      </FormLabel>
                      {images.length === 0 ? (
                        <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-md p-8 text-muted-foreground min-h-[150px]">
                          <ImageIcon className="h-10 w-10 mb-2 text-gray-400" />
                          <p className="mb-1 font-semibold">No images added yet</p>
                          <p className="text-sm">Add images by pasting URLs above.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-2">
                          {images.map((image, index) => (
                            <div
                              key={index}
                              className="relative group aspect-square rounded-md overflow-hidden border bg-muted/30"
                            >
                              <Image
                                src={image.url || "/placeholder.svg?width=200&height=200&query=product+image"}
                                alt={`Product image ${index + 1}`}
                                fill
                                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                                className="object-cover"
                                onError={(e) => {
                                  ;(e.target as HTMLImageElement).src = "/placeholder.svg?width=200&height=200"
                                }}
                              />
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  onClick={() => handleRemoveImage(index)}
                                  className="rounded-full h-8 w-8"
                                  disabled={loading}
                                >
                                  <X className="h-4 w-4" />
                                  <span className="sr-only">Remove image</span>
                                </Button>
                              </div>
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-white text-xs p-1.5 truncate">
                                {image.url.substring(image.url.lastIndexOf("/") + 1) || "Image"}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* FormMessage for the entire image array field */}
                      <FormField control={form.control} name="image" render={() => <FormMessage className="mt-2" />} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border bg-card shadow-sm">
              <CardContent className="pt-6">
                <h3 className="text-lg font-medium mb-4">Keywords</h3>
                <FormField
                  control={form.control}
                  name="keywords"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Product Keywords</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-2 relative">
                          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            value={currentKeyword}
                            onChange={(e) => setCurrentKeyword(e.target.value)}
                            onKeyDown={handleKeywordInputKeyDown}
                            placeholder="Type keyword and press Enter"
                            disabled={loading}
                            className="h-12 text-base pl-10 pr-20 bg-background border-input flex-grow" // pr for button
                          />
                          <Button
                            type="button"
                            onClick={handleAddKeyword}
                            disabled={loading || !currentKeyword.trim()}
                            variant="outline"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-10 px-3"
                          >
                            <PlusCircle className="h-4 w-4 mr-0 sm:mr-2" />{" "}
                            <span className="hidden sm:inline">Add</span>
                          </Button>
                        </div>
                      </FormControl>
                      {field.value && field.value.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-dashed">
                          {field.value.map((keyword, index) => (
                            <Badge key={index} variant="secondary" className="text-sm py-1 px-2">
                              {keyword}
                              <button
                                type="button"
                                onClick={() => handleRemoveKeyword(keyword)}
                                className="ml-1.5 rounded-full hover:bg-destructive/20 p-0.5 focus:outline-none focus:ring-1 focus:ring-destructive"
                                aria-label={`Remove ${keyword}`}
                                disabled={loading}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card className="border border-border bg-card shadow-sm">
              <CardContent className="pt-6">
                <h3 className="text-lg font-medium mb-4">Download Information</h3>
                <FormField
                  control={form.control}
                  name="downloadUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">Secure File Link (Optional)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <FileDown className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                          <Input
                            disabled={loading}
                            placeholder="https://your-cdn.com/secure-file.zip"
                            {...field}
                            className="h-12 text-base pl-10 bg-background border-input"
                          />
                        </div>
                      </FormControl>
                      <FormDescription>Optional secure download link for digital products.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card className="border border-border bg-card shadow-sm">
              <CardContent className="pt-6">
                <h3 className="text-lg font-medium mb-4">Product Status</h3>
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="isFeatured"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-card/50 hover:bg-card/80 transition-colors cursor-pointer">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="mt-1"
                            disabled={loading}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-base font-medium">Featured Product</FormLabel>
                          <FormDescription>
                            This product will appear prominently, e.g., on the home page.
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="isArchived"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-card/50 hover:bg-card/80 transition-colors cursor-pointer">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="mt-1"
                            disabled={loading}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-base font-medium">Archive Product</FormLabel>
                          <FormDescription>This product will be hidden from the store listings.</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Desktop Save Button */}
          <div className="hidden md:flex justify-end pt-4">
            <Button type="submit" disabled={loading} size="lg" className="px-8">
              {loading ? "Saving..." : action}
            </Button>
          </div>

          {/* Mobile Fixed Bottom Bar */}
          <div className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-sm border-t border-border p-4 md:hidden flex justify-between gap-x-3 z-50">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => router.push(`/${params.storeId}/products`)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button disabled={loading} type="submit" className="flex-1">
              {loading ? "Saving..." : action}
            </Button>
          </div>
        </form>
      </Form>
    </>
  )
}

