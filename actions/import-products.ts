"use server"

import { z } from "zod"
import prismadb from "@/lib/prismadb"
import { revalidatePath } from "next/cache"

// Define the product schema for validation
const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Price must be 0 or greater"),
  categoryId: z.string().min(1, "Category ID is required"),
  downloadUrl: z
    .union([
      z.string().url().optional().nullable(),
      z
        .object({
          text: z.string().optional(),
          hyperlink: z.string().url(),
        })
        .transform((obj) => obj.hyperlink),
      z
        .object({
          hyperlink: z.string().url(),
        })
        .transform((obj) => obj.hyperlink),
    ])
    .optional()
    .nullable(),
  keywords: z.array(z.string()).optional().default([]),
  isFeatured: z.boolean().optional().default(false),
  isArchived: z.boolean().optional().default(false),
})

type ProductInput = z.infer<typeof productSchema>

// Function to check if a category exists in the database
async function categoryExists(storeId: string, categoryId: string): Promise<boolean> {
  const category = await prismadb.category.findFirst({
    where: {
      id: categoryId,
      storeId: storeId,
    },
  })

  return !!category
}

export async function importProducts(
  storeId: string,
  products: ProductInput[],
): Promise<{ success: number; failed: number }> {
  if (!storeId) {
    throw new Error("Store ID is required")
  }

  if (!products.length) {
    return { success: 0, failed: 0 }
  }

  let successCount = 0
  let failedCount = 0

  // Validate each product
  const validatedProducts = []

  for (const product of products) {
    try {
      // Basic schema validation
      const validatedProduct = productSchema.parse(product)

      // Check if category exists
      const categoryValid = await categoryExists(storeId, validatedProduct.categoryId)
      if (!categoryValid) {
        failedCount++
        console.error(`Category ${validatedProduct.categoryId} does not exist in store ${storeId}`)
        continue
      }

      // Add storeId to the product
      validatedProducts.push({
        ...validatedProduct,
        storeId,
      })

      successCount++
    } catch (error) {
      failedCount++
      console.error("Validation error:", error)
    }
  }

  try {
    // Insert in batches of 500
    for (let i = 0; i < validatedProducts.length; i += 500) {
      const batch = validatedProducts.slice(i, i + 500)

      await prismadb.products.createMany({
        data: batch.map((product) => ({
          id: crypto.randomUUID(),
          storeId,
          categoryId: product.categoryId,
          name: product.name,
          description: product.description,
          price: product.price,
          keywords: product.keywords,
          downloadUrl: product.downloadUrl,
          isFeatured: product.isFeatured,
          isArchived: product.isArchived,
          updatedAt: new Date(),
        })),
        skipDuplicates: true,
      })
    }
  } catch (error) {
    console.error("Database error:", error)
    throw new Error("Failed to import products to database")
  }

  // Revalidate the products page to show the newly imported products
  revalidatePath(`/admin/${storeId}/products`)

  return {
    success: successCount,
    failed: failedCount,
  }
}
