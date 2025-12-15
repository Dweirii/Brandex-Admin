import { z } from "zod"

export const productImportSchema = z.object({
  name: z
    .string()
    .min(1, "Product name is required")
    .max(100, "Product name must be less than 100 characters")
    // More permissive regex - allows Unicode, most special chars, but blocks control chars and null bytes
    .refine((val) => {
      // Block only truly dangerous characters: control chars, null bytes, and script injection attempts
      return !/[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(val) && 
             !val.includes('<script') && 
             !val.includes('javascript:') &&
             val.trim().length > 0;
    }, "Product name contains invalid characters"),

  description: z.string().max(1000, "Description must be less than 1000 characters").optional().nullable(),

  price: z
    .string()
    .transform((val) => {
      // Handle "free" as 0
      const normalized = val.toLowerCase().trim()
      if (normalized === "free" || normalized === "0" || normalized === "0.00") {
        return 0
      }
      const num = Number.parseFloat(val.replace(/[,$]/g, ""));
      return num;
    })
    .refine((val) => !isNaN(val) && val >= 0 && val <= 999999.99, {
      message: "Price must be a number between 0 and 999,999.99, or 'free'",
    }),

  categoryId: z.string().uuid("Category ID must be a valid UUID format"),

  downloadUrl: z.string().optional(),

  videoUrl: z
  .string()
  .trim()
  .optional()
  .refine(
    (val) =>
      !val || val === "" || /^https?:\/\/.+\.(mp4|mov)$/i.test(val),
    {
      message: "Video URL must be a valid .mp4 or .mov URL",
    }
  ),



  imageUrl: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (typeof val === "string") {
        return val.split(",").map((url) => url.trim()).filter(Boolean);
      }
      return val;
    }),

  isFeatured: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === "1" || val === "yes")
    .default("false"),

  isArchived: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === "1" || val === "yes")
    .default("false"),

  keywords: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((val) => {
      if (typeof val === "string") {
        return val.split(",").map((k) => k.trim()).filter(Boolean);
      }
      return val;
    }),
})

export type ProductImportRow = z.input<typeof productImportSchema>
export type ValidatedProductImportRow = z.output<typeof productImportSchema>

export const validateProductBatch = (rows: ProductImportRow[]) => {
  const validRows: ValidatedProductImportRow[] = []
  const errors: Array<{ row: number; field: string; message: string }> = []

  rows.forEach((row, index) => {
    const result = productImportSchema.safeParse(row)

    if (result.success) {
      validRows.push(result.data)
    } else {
      result.error.errors.forEach((error) => {
        errors.push({
          row: index + 1,
          field: error.path.join("."),
          message: error.message,
        })
      })
    }
  })

  return { validRows, errors }
}
