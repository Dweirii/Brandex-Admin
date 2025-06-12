import Papa from "papaparse";
import { ProductImportRow, productImportSchema } from "@/lib/validation/product-import-schema";

export async function parseCsvFile(buffer: Buffer): Promise<ProductImportRow[]> {
  const text = buffer.toString("utf-8");

  return new Promise((resolve, reject) => {
    Papa.parse<ProductImportRow>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data.map((row) => ({
          ...row,
          imageUrl: typeof row.imageUrl === "string" ? row.imageUrl.split(",").map((x) => x.trim()) : [],
          keywords: typeof row.keywords === "string" ? row.keywords.split(",").map((x) => x.trim()) : [],
        }));

        const valid = data.filter((row) => productImportSchema.safeParse(row).success);
        resolve(valid);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error: (err: any) => {
        reject(err);
      },
    });
  });
}
