import { z } from "zod"

export const productImportSchema = z.object({
  name: z
    .string()
    .min(1, "Product name is required")
    .max(100, "Product name must be less than 100 characters")
    .regex(/^[a-zA-Z0-9\s\-_.:,()&+/]+$/, "Product name contains invalid characters"),


  description: z.string().max(1000, "Description must be less than 1000 characters").optional().nullable(),

  price: z
    .string()
    .transform((val) => {
      const num = Number.parseFloat(val.replace(/[,$]/g, ""));
      return num;
    })
    .refine((val) => !isNaN(val) && val > 0 && val <= 999999.99, {
      message: "Price must be a positive number between 0.01 and 999,999.99",
    }),

  categoryId: z.string().uuid("Category ID must be a valid UUID format"),

  downloadUrl: z.string().optional(),

  imageUrl: z.string().url("Image URL must be a valid URL").optional(), // ✅ أضف هذا

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
});


export type ProductImportRow = z.input<typeof productImportSchema>
export type ValidatedProductImportRow = z.output<typeof productImportSchema>

// Enhanced batch validation with detailed error reporting
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
