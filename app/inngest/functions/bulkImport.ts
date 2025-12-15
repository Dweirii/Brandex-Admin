import { inngest } from "@/app/inngest/inngest";
import prismadb from "@/lib/prismadb";
import { Decimal } from "@prisma/client/runtime/library";

interface ProductRow {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  downloadUrl: string | null;
  imageUrl?: string[] | string | null;
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

    console.log(`🚀 [Inngest] Starting bulk import for store ${storeId}`);
    console.log(`📊 [Inngest] Processing ${items.length} items in chunks of ${CHUNK_SIZE}`);

    const totalChunks = Math.ceil(items.length / CHUNK_SIZE);

    // Initialize accumulator in a step to persist across replays
    let accumulator = await step.run("initialize-accumulator", async () => {
      return { successCount: 0, failedCount: 0, failedItems: [] as Array<{ name: string; error: string }> };
    });

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk: ProductRow[] = items.slice(i, i + CHUNK_SIZE);
      const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;

      console.log(`🔄 [Inngest] Processing chunk ${chunkNumber}/${totalChunks} (${chunk.length} items)`);

      const chunkResult = await step.run(`insert-batch-${i}`, async () => {
        // Process each item individually with error handling
        const results = await Promise.allSettled(
          chunk.map(async (row: ProductRow) => {
            try {
              // Ensure imageUrl is always an array of valid URLs
              let imageUrls: string[] = [];
              if (row.imageUrl) {
                if (Array.isArray(row.imageUrl)) {
                  imageUrls = row.imageUrl.filter((url) => url && typeof url === 'string' && url.trim().length > 0);
                } else if (typeof row.imageUrl === 'string') {
                  // Handle comma-separated string
                  imageUrls = row.imageUrl.split(',').map(url => url.trim()).filter(url => url.length > 0);
                }
              }

              const existing = await prismadb.products.findFirst({
                where: {
                  storeId: storeId,
                  name: row.name,
                },
                include: { Image: true },
              });

              const rowPrice = new Decimal(row.price);

              if (existing) {
                console.log(`🔄 [Inngest] Product "${row.name}" already exists, updating...`);
                const isDifferent =
                  existing.description !== row.description ||
                  !existing.price.equals(rowPrice) ||
                  existing.downloadUrl !== row.downloadUrl ||
                  existing.isFeatured !== row.isFeatured ||
                  existing.isArchived !== row.isArchived ||
                  existing.categoryId !== row.categoryId ||
                  existing.videoUrl !== row.videoUrl ||
                  JSON.stringify(existing.keywords || []) !== JSON.stringify(row.keywords || []);

                if (!isDifferent) {
                  // Still update images if they're different
                  const existingImageUrls = (existing.Image || []).map((img) => img.url).sort();
                  const newImageUrls = imageUrls.sort();
                  const imagesDifferent = JSON.stringify(existingImageUrls) !== JSON.stringify(newImageUrls);

                  if (imagesDifferent) {
                    await prismadb.image.deleteMany({ where: { productId: existing.id } });
                    if (imageUrls.length > 0) {
                      await prismadb.image.createMany({
                        data: imageUrls.map((url: string) => ({ 
                          id: crypto.randomUUID(), 
                          url: url.trim(), 
                          productId: existing.id, 
                          updatedAt: new Date() 
                        })),
                      });
                    }
                  }
                  return { success: true, name: row.name };
                }

                await prismadb.products.update({
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

                // Always update images if provided
                await prismadb.image.deleteMany({ where: { productId: existing.id } });
                if (imageUrls.length > 0) {
                  await prismadb.image.createMany({
                    data: imageUrls.map((url: string) => ({ 
                      id: crypto.randomUUID(), 
                      url: url.trim(), 
                      productId: existing.id, 
                      updatedAt: new Date() 
                    })),
                  });
                }
              } else {
                // Try to create, but handle unique constraint (duplicate name)
                let product;
                try {
                  console.log(`➕ [Inngest] Creating new product: "${row.name}"`);
                  product = await prismadb.products.create({
                    data: {
                      id: crypto.randomUUID(),
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
                      updatedAt: new Date(),
                    },
                  });
                  console.log(`✅ [Inngest] Successfully created product: "${row.name}" (ID: ${product.id})`);
                } catch (createError: unknown) {
                  // If unique constraint violation, product already exists - fetch and update it
                  const error = createError as { code?: string; message?: string };
                  if (error?.code === 'P2002' || error?.message?.includes('Unique constraint')) {
                    console.log(`⚠️ [Inngest] Unique constraint violation for "${row.name}", fetching existing product...`);
                    const existingProduct = await prismadb.products.findFirst({
                      where: {
                        storeId: storeId,
                        name: row.name,
                      },
                      include: { Image: true },
                    });

                    if (existingProduct) {
                      console.log(`🔄 [Inngest] Found existing product "${row.name}", updating...`);
                      // Update existing product
                      await prismadb.products.update({
                        where: { id: existingProduct.id },
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

                      // Update images
                      await prismadb.image.deleteMany({ where: { productId: existingProduct.id } });
                      if (imageUrls.length > 0) {
                        await prismadb.image.createMany({
                          data: imageUrls.map((url: string) => ({ 
                            id: crypto.randomUUID(), 
                            url: url.trim(), 
                            productId: existingProduct.id, 
                            updatedAt: new Date() 
                          })),
                        });
                      }

                      product = existingProduct;
                      console.log(`✅ [Inngest] Updated existing product: "${row.name}" (ID: ${product.id})`);
                    } else {
                      // If we can't find it, this is unexpected - log and rethrow
                      console.error(`❌ [Inngest] Unique constraint error but product not found: "${row.name}"`);
                      throw createError;
                    }
                  } else {
                    // Other errors, log and rethrow
                    console.error(`❌ [Inngest] Error creating product "${row.name}":`, createError);
                    throw createError;
                  }
                }

                // Always create images if provided and product was created (not updated above)
                if (product && imageUrls.length > 0) {
                  // Check if images were already created (in the catch block)
                  const existingImages = await prismadb.image.findMany({
                    where: { productId: product.id },
                  });

                  if (existingImages.length === 0) {
                    await prismadb.image.createMany({
                      data: imageUrls.map((url: string) => ({ 
                        id: crypto.randomUUID(), 
                        url: url.trim(), 
                        productId: product.id, 
                        updatedAt: new Date() 
                      })),
                    });
                  }
                }
              }

              return { success: true, name: row.name };
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error(`Failed to import product ${row.name}:`, errorMessage);
              throw { name: row.name, error: errorMessage };
            }
          })
        );

        // Process results and return counts
        let chunkSuccess = 0;
        let chunkFailed = 0;
        const chunkFailedItems: Array<{ name: string; error: string }> = [];

        results.forEach((result) => {
          if (result.status === "fulfilled") {
            if (result.value?.success) {
              chunkSuccess++;
            }
          } else {
            chunkFailed++;
            const errorInfo = result.reason as { name: string; error: string } | undefined;
            if (errorInfo) {
              chunkFailedItems.push(errorInfo);
              console.error(`❌ [Inngest] Failed to import: ${errorInfo.name} - ${errorInfo.error}`);
            }
          }
        });

        console.log(`✅ [Inngest] Chunk ${chunkNumber}/${totalChunks} completed: ${chunkSuccess} success, ${chunkFailed} failed`);

        // Return counts from this chunk
        return {
          success: chunkSuccess,
          failed: chunkFailed,
          failedItems: chunkFailedItems,
        };
      });

      // Accumulate counts in a persistent step
      accumulator = await step.run(`accumulate-counts-${i}`, async () => {
        return {
          successCount: accumulator.successCount + chunkResult.success,
          failedCount: accumulator.failedCount + chunkResult.failed,
          failedItems: [...accumulator.failedItems, ...chunkResult.failedItems],
        };
      });
    }

    console.log(`🎉 [Inngest] Bulk import completed for store ${storeId}`);
    console.log(`📈 [Inngest] Results: ${accumulator.successCount} succeeded, ${accumulator.failedCount} failed out of ${items.length} total`);
    
    if (accumulator.failedCount > 0) {
      console.error(`⚠️ [Inngest] ${accumulator.failedCount} items failed to import`);
      accumulator.failedItems.slice(0, 10).forEach((item) => {
        console.error(`  - ${item.name}: ${item.error}`);
      });
      if (accumulator.failedItems.length > 10) {
        console.error(`  ... and ${accumulator.failedItems.length - 10} more failures`);
      }
    }

    return { 
      status: "completed", 
      totalItems: items.length,
      successCount: accumulator.successCount,
      failedCount: accumulator.failedCount,
      failedItems: accumulator.failedItems.slice(0, 100) // Limit to first 100 failures
    };
  }
);
