"use client"

import type React from "react"
import type { Category, Image as ImageType, Product } from "@prisma/client"
import { Button } from "@/components/ui/button"
import { Heading } from "@/components/ui/heading"
import { Separator } from "@/components/ui/separator"
import * as z from "zod"
import { Trash, X, ArrowLeft, DollarSign, Tag, Moon, Sun, ImageIcon, FileDown, FileText } from "lucide-react"
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

const formSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  description: z.string().optional(),
  image: z.array(z.object({ url: z.string() })).min(1, "At least one image is required"),
  price: z.coerce.number().min(0.01, "Price must be greater than 0"),
  downloadUrl: z.string().optional(),
  categoryId: z.string().min(1, "Category is required"),
  isFeatured: z.boolean().default(false),
  isArchived: z.boolean().default(false),
})

type ProductFormValues = z.infer<typeof formSchema>

interface ProductFormProps {
  initialData:
    | (Product & {
        Image: ImageType[]
      })
    | null
  categories: Category[]
}

export const ProductForm: React.FC<ProductFormProps> = ({ initialData, categories }) => {
  // State management
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [imageUrl, setImageUrl] = useState("")

  // Hooks
  const params = useParams()
  const router = useRouter()
  const isMobile = useMobile()

  const { setTheme, theme } = useTheme()

  // UI text variables
  const title = initialData ? "Edit Product" : "Create Product"
  const description = initialData ? "Make changes to your product" : "Add a new product to your store"
  const toastMessage = initialData ? "Product updated successfully" : "Product created successfully"
  const action = initialData ? "Save changes" : "Create product"

  // Form initialization
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          ...initialData,
          price: Number.parseFloat(String(initialData?.price)),
          image: initialData.Image || [],
          description: initialData.description || "",
          downloadUrl: initialData.downloadUrl || "",
        }
      : {
          name: "",
          description: "",
          image: [],
          price: 0,
          downloadUrl: "",
          categoryId: "",
          isFeatured: false,
          isArchived: false,
        },
  })

  const onSubmit = async (data: ProductFormValues) => {
    try {
      setLoading(true)

      const { image, ...rest } = data
      const payload = {
        ...rest,
        Image: image,
      }

      if (initialData) {
        await axios.patch(`/api/${params.storeId}/products/${params.productId}`, payload)
      } else {
        await axios.post(`/api/${params.storeId}/products`, payload)
      }

      toast.success(toastMessage)
      router.refresh()
      router.push(`/${params.storeId}/products`)
    } 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    catch (error: any) {
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

    const currentImages = [...images]
    currentImages.push({ url: imageUrl })
    form.setValue("image", currentImages, { shouldValidate: true })
    setImageUrl("")
    toast.success("Image URL added successfully")
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
          <Heading title={title} description={description} />
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
                              <Tag className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
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
                              <DollarSign className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
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
                              <FileText className="absolute left-3 top-3 h-7 w-5 text-muted-foreground" />
                              <Textarea
                                disabled={loading}
                                placeholder="Product description..."
                                {...field}
                                className="min-h-[120px] pt-4 pl-10 bg-background border-input resize-none"
                              />
                            </div>
                          </FormControl>
                          <FormDescription>Optional product description</FormDescription>
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
                      <div className="flex flex-col gap-4">
                        <div className="relative">
                          <ImageIcon className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                          <Input
                            placeholder="https://example.com/your-image.jpg"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            className="h-12 pl-10 pr-24 bg-background border-input"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                handleAddImage()
                              }
                            }}
                          />
                          <Button type="button" className="absolute right-1 top-1 h-10" onClick={handleAddImage}>
                            Add Image
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Paste the direct URL to your image. Press Enter or click Add Image to add it to the product.
                        </p>
                      </div>
                    </div>

                    <div>
                      <FormLabel className="text-base mb-2 block">
                        Product Images {images.length > 0 && `(${images.length})`}
                      </FormLabel>
                      {images.length === 0 ? (
                        <div className="flex flex-col items-center justify-center border border-dashed rounded-md p-8 text-muted-foreground">
                          <div className="text-center">
                            <p className="mb-2">No images added yet</p>
                            <p className="text-sm">Add images by pasting image URLs above</p>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-2">
                          {images.map((image, index) => (
                            <div
                              key={index}
                              className="relative group aspect-square rounded-md overflow-hidden border bg-background"
                            >
                              <Image
                                src={image.url || "/placeholder.svg"}
                                alt="Product image"
                                fill
                                className="object-cover"
                              />
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon"
                                  onClick={() => handleRemoveImage(index)}
                                  className="rounded-full"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate">
                                {image.url.split("/").pop()}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <FormMessage className="mt-2">{form.formState.errors.image?.message}</FormMessage>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border bg-card shadow-sm">
              <CardContent className="pt-6">
                <h3 className="text-lg font-medium mb-4">Download URL</h3>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="downloadUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base">BunnyCDN Secure File Link</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <FileDown className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                            <Input
                              disabled={loading}
                              placeholder="https://bunnycdn.com/secure-file-link.zip"
                              {...field}
                              value={field.value}
                              className="h-12 text-base pl-10 bg-background border-input"
                            />
                          </div>
                        </FormControl>
                        <FormDescription>Optional secure download link for digital products</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
            
            <Card className="border border-border bg-card shadow-sm">
              <CardContent className="pt-6">
                <h3 className="text-lg font-medium mb-4">Product Visibility</h3>
                <div className="grid gap-6 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="isFeatured"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-card/50 hover:bg-card/80 transition-colors">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-1" />
                        </FormControl>
                        <div className="space-y-1">
                          <FormLabel className="text-base">Featured Product</FormLabel>
                          <FormDescription>This product will appear on the home page</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="isArchived"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 bg-card/50 hover:bg-card/80 transition-colors">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-1" />
                        </FormControl>
                        <div className="space-y-1">
                          <FormLabel className="text-base">Archive Product</FormLabel>
                          <FormDescription>This product will not appear in the store</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Desktop Save Button */}
          <div className="hidden md:flex justify-end">
            <Button type="submit" disabled={loading} size="lg" className="px-8">
              {loading ? "Saving..." : action}
            </Button>
          </div>

          {/* Mobile Fixed Bottom Bar */}
          <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm border-t border-border p-4 md:hidden flex justify-between gap-x-2 z-10">
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
