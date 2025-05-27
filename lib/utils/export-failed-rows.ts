import Papa from "papaparse"
import type { ProductImportRow } from "@/lib/validation/product-import-schema"

export function exportFailedRowsAsCsv(failedRows: ProductImportRow[]) {
  const csv = Papa.unparse(failedRows, {
    header: true,
    columns: ["name", "description", "price", "categoryId", "downloadUrl", "isFeatured", "isArchived"],
  })

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const link = document.createElement("a")

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `failed-rows-${new Date().toISOString().split("T")[0]}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
}
