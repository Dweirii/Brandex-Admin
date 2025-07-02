import { inngest } from "@/app/inngest/inngest";
import prismadb from "@/lib/prismadb";
import { Decimal } from "@prisma/client/runtime/library";

interface ProductRow {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  downloadUrl: string | null;
  imageUrl: string[];
  isFeatured: boolean;
  isArchived: boolean;
  keywords: string[];
  videoUrl?: string | null;
}

// eslint-disable-next-line  @typescript-eslint/no-unused-vars
interface BulkImportEvent {
  name: "bulk.import";
  data: {
    storeId: string;
    items: ProductRow[];
  };
}

export const bulkImport = inngest.createFunction(
  { id: "bulk-import", name: "Bulk Import Products" },
  { event: "bulk.import" },
  async ({ event, step }) => {
    const { items, storeId } = event.data;
    const CHUNK_SIZE = 100;

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk: ProductRow[] = items.slice(i, i + CHUNK_SIZE);

      await step.run(`insert-batch-${i}`, async () => {
        await Promise.all(
          chunk.map(async (row: ProductRow) => {
            const existing = await prismadb.product.findFirst({
              where: {
                storeId: storeId,
                name: row.name,
              },
              include: { Image: true },
            });

            const rowPrice = new Decimal(row.price);

            if (existing) {
              const isDifferent =
                existing.description !== row.description ||
                !existing.price.equals(rowPrice) ||
                existing.downloadUrl !== row.downloadUrl ||
                existing.isFeatured !== row.isFeatured ||
                existing.isArchived !== row.isArchived ||
                existing.categoryId !== row.categoryId ||
                existing.videoUrl !== row.videoUrl ||

                JSON.stringify(existing.keywords || []) !== JSON.stringify(row.keywords || []);

              if (!isDifferent) return;

              await prismadb.product.update({
                where: { id: existing.id },
                data: {
                  description: row.description,
                  price: rowPrice,
                  categoryId: row.categoryId,
                  downloadUrl: row.downloadUrl ?? null,
                  isFeatured: row.isFeatured,
                  isArchived: row.isArchived,
                  keywords: row.keywords,
                  videoUrl: row.videoUrl ?? null,
                },
              });

              // Replace images if changed
              if (row.imageUrl.length) {
                await prismadb.image.deleteMany({ where: { productId: existing.id } });
                await prismadb.image.createMany({
                  data: row.imageUrl.map((url: string) => ({ url, productId: existing.id })),
                });
              }
            } else {
              const product = await prismadb.product.create({
                data: {
                  name: row.name,
                  description: row.description,
                  price: rowPrice,
                  categoryId: row.categoryId,
                  downloadUrl: row.downloadUrl ?? null,
                  isFeatured: row.isFeatured,
                  isArchived: row.isArchived,
                  keywords: row.keywords,
                  videoUrl: row.videoUrl ?? null,
                  storeId: storeId,
                },
              });

              if (row.imageUrl.length) {
                await prismadb.image.createMany({
                  data: row.imageUrl.map((url: string) => ({ url, productId: product.id })),
                });
              }
            }
          })
        );
      });
    }

    return { status: "completed", totalItems: items.length };
  }
);
