import { inngest } from "@/app/inngest/inngest";
import { hasJob, updateJob, getJob, setJob } from "@/lib/job-store";
import prismadb from "@/lib/prismadb";

interface GeneratedProduct {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  imageUrl: string;
  downloadUrl: string;
  keywords: string[];
}

export const generateProductsFromImages = inngest.createFunction(
  { id: "generate-products-from-images", name: "Generate Products from Images" },
  { event: "products.generate-from-images" },
  async ({ event, step }) => {
    const { imageUrls, categoryId, price, storeId, jobId } = event.data;
    const BATCH_SIZE = 50; // Process 50 images per batch (increased from 10 for better performance)
    const CONCURRENT_LIMIT = 10; // Process 10 images concurrently per batch (increased from 5)

    try {
      console.log(`🚀 [Inngest] Starting product generation for job ${jobId}`);
      console.log(`📊 [Inngest] Processing ${imageUrls.length} images in batches of ${BATCH_SIZE}`);

      // Update job status to processing (or create if doesn't exist due to process isolation)
      if (hasJob(jobId)) {
        updateJob(jobId, { status: "processing" });
      } else {
        // Job might not exist if Inngest is in a different process (common in production)
        // Create it here to ensure it exists
        console.log(`⚠️ [Inngest] Job ${jobId} not found in store, creating it`);
        setJob(jobId, {
          status: "processing",
          total: imageUrls.length,
          processed: 0,
          failed: 0,
          products: [],
          createdAt: Date.now(),
        });
      }

      const openaiApiKey = process.env.OPENAI_API_KEY;
      if (!openaiApiKey) {
        throw new Error("OpenAI API key not configured");
      }

      // Initialize accumulator
      // Limit stored data to prevent state size issues
      const MAX_STORED_PRODUCTS = 100; // Only store first 100 products for job status
      const MAX_FAILED_URLS = 100; // Only store first 100 failed URLs
      let accumulator = await step.run("initialize-accumulator", async () => {
        return {
          products: [] as GeneratedProduct[],
          processed: 0,
          failed: 0,
          failedUrls: [] as string[],
        };
      });

      // Process images in batches
      const totalBatches = Math.ceil(imageUrls.length / BATCH_SIZE);

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batch = imageUrls.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
        const batchNumber = batchIndex + 1;

        console.log(`🔄 [Inngest] Processing batch ${batchNumber}/${totalBatches} (${batch.length} images)`);

        const batchResult = await step.run(`process-batch-${batchIndex}`, async () => {
        const batchProducts: GeneratedProduct[] = [];
        const batchFailed: string[] = [];

        // Process images with concurrency control
        const processImage = async (imageUrl: string): Promise<{ success: boolean; product?: GeneratedProduct; url: string }> => {
          try {
            // Call OpenAI Vision API
            const response = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${openaiApiKey}`,
              },
              body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                  {
                    role: "system",
                    content:
                      "You are a product description generator for an e-commerce platform. Analyze the image and generate a product name, description, and relevant keywords. The product name should be concise (under 100 characters), the description should be detailed but under 1000 characters, and keywords should be comma-separated.",
                  },
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Analyze this product image and provide:\n1. A product name (concise, under 100 characters)\n2. A detailed product description (under 1000 characters)\n3. Comma-separated keywords (5-10 keywords)\n\nReturn the response in JSON format: {\"name\": \"...\", \"description\": \"...\", \"keywords\": \"keyword1, keyword2, ...\"}",
                      },
                      {
                        type: "image_url",
                        image_url: {
                          url: imageUrl,
                        },
                      },
                    ],
                  },
                ],
                max_tokens: 500,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              console.error(`OpenAI API error for ${imageUrl}:`, errorData);
              return { success: false, url: imageUrl };
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
              console.error(`No content returned for ${imageUrl}`);
              return { success: false, url: imageUrl };
            }

            // Check if OpenAI refused to process the image
            const refusalPhrases = ["I'm sorry", "I'm unable", "I cannot", "I can't", "I apologize"];
            const isRefusal = refusalPhrases.some(phrase => content.trim().startsWith(phrase));
            
            if (isRefusal) {
              console.warn(`⚠️ OpenAI refused to process ${imageUrl}: ${content.substring(0, 100)}...`);
              return { success: false, url: imageUrl };
            }

            // Parse JSON response
            let productData: { name?: string; description?: string; keywords?: string };
            try {
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                productData = JSON.parse(jsonMatch[0]);
              } else {
                productData = JSON.parse(content);
              }
            } catch (parseError) {
              console.error(`Failed to parse OpenAI response for ${imageUrl}: ${content.substring(0, 100)}...`);
              // Fallback: create basic product from URL
              const urlParts = imageUrl.split("/").pop() || "Product";
              const baseName = urlParts.split(".")[0].replace(/[-_]/g, " ");
              productData = {
                name: baseName.charAt(0).toUpperCase() + baseName.slice(1),
                description: `Product image: ${urlParts}`,
                keywords: "product,digital",
              };
            }

            // Create product object
            let productName = productData.name || `Product ${batchProducts.length + 1}`;
            if (productName.length > 100) {
              productName = productName.substring(0, 97) + "...";
            }

            let productDescription = productData.description || "";
            if (productDescription.length > 1000) {
              productDescription = productDescription.substring(0, 997) + "...";
            }

            const product: GeneratedProduct = {
              name: productName,
              description: productDescription,
              price: String(price),
              categoryId,
              imageUrl,
              downloadUrl: imageUrl, // Same as imageUrl
              keywords: productData.keywords
                ? productData.keywords.split(",").map((k: string) => k.trim()).filter(Boolean)
                : [],
            };

            return { success: true, product, url: imageUrl };
          } catch (error) {
            console.error(`Error processing image ${imageUrl}:`, error);
            return { success: false, url: imageUrl };
          }
        };

        // Process batch with concurrency limit
        for (let i = 0; i < batch.length; i += CONCURRENT_LIMIT) {
          const concurrentBatch = batch.slice(i, i + CONCURRENT_LIMIT);
          const results = await Promise.allSettled(concurrentBatch.map((url: string) => processImage(url)));

          results.forEach((result) => {
            if (result.status === "fulfilled") {
              if (result.value.success && result.value.product) {
                batchProducts.push(result.value.product);
              } else {
                batchFailed.push(result.value.url);
              }
            } else {
              batchFailed.push(batch[i] || "unknown");
            }
          });

          // Small delay between concurrent batches
          if (i + CONCURRENT_LIMIT < batch.length) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        }

        return {
          products: batchProducts,
          processed: batchProducts.length,
          failed: batchFailed.length,
          failedUrls: batchFailed,
        };
        });

        // Accumulate results
        // Limit stored products and failed URLs to prevent state size issues
        accumulator = await step.run(`accumulate-batch-${batchIndex}`, async () => {
          const newProducts = [...accumulator.products, ...batchResult.products];
          const newFailedUrls = [...accumulator.failedUrls, ...batchResult.failedUrls];
          return {
            products: newProducts.slice(0, MAX_STORED_PRODUCTS),
            processed: accumulator.processed + batchResult.processed,
            failed: accumulator.failed + batchResult.failed,
            failedUrls: newFailedUrls.slice(0, MAX_FAILED_URLS),
          };
        });

        // Save batch products to database (batch insert for performance)
        if (batchResult.products.length > 0) {
          await step.run(`save-batch-${batchIndex}`, async () => {
            const savedCount = { success: 0, failed: 0, duplicates: 0 };

            try {
              // Check for existing products in bulk
              const productNames = batchResult.products.map(p => p.name);
              const existingProducts = await prismadb.products.findMany({
                where: {
                  storeId,
                  name: { in: productNames },
                },
                select: { name: true },
              });

              const existingNames = new Set(existingProducts.map(p => p.name));
              const newProducts = batchResult.products.filter(p => !existingNames.has(p.name));
              savedCount.duplicates = batchResult.products.length - newProducts.length;

              if (savedCount.duplicates > 0) {
                console.log(`⚠️ [Inngest] Skipping ${savedCount.duplicates} duplicate products in batch ${batchNumber}`);
              }

              // Batch insert new products with their images using transaction
              if (newProducts.length > 0) {
                const now = new Date();
                
                // Create products and images in parallel for better performance
                await prismadb.$transaction(
                  newProducts.map(product => {
                    const productId = crypto.randomUUID();
                    const imageId = crypto.randomUUID();
                    
                    return prismadb.products.create({
                      data: {
                        id: productId,
                        storeId,
                        categoryId: product.categoryId,
                        name: product.name,
                        description: product.description,
                        price: product.price,
                        downloadUrl: product.downloadUrl,
                        keywords: product.keywords,
                        isFeatured: false,
                        isArchived: false,
                        createdAt: now,
                        updatedAt: now,
                        Image: {
                          create: {
                            id: imageId,
                            url: product.imageUrl,
                            createdAt: now,
                            updatedAt: now,
                          },
                        },
                      },
                    });
                  })
                );

                savedCount.success = newProducts.length;
                console.log(`💾 [Inngest] Batch ${batchNumber} saved: ${savedCount.success} products`);
              }
            } catch (error) {
              console.error(`❌ [Inngest] Database error for batch ${batchNumber}:`, error);
              savedCount.failed = batchResult.products.length - savedCount.duplicates;
            }

            console.log(`💾 [Inngest] Batch ${batchNumber} complete: ${savedCount.success} saved, ${savedCount.duplicates} duplicates, ${savedCount.failed} errors`);
            return savedCount;
          });
        }

        console.log(`✅ [Inngest] Batch ${batchNumber}/${totalBatches} completed: ${batchResult.processed} success, ${batchResult.failed} failed`);
      }

      console.log(`🎉 [Inngest] Product generation completed for job ${jobId}`);
      console.log(`📈 [Inngest] Results: ${accumulator.processed} succeeded, ${accumulator.failed} failed out of ${imageUrls.length} total`);

      // Update job status - accumulate counts instead of overwriting
      if (hasJob(jobId)) {
        // Get current job state before updating
        const currentJob = getJob(jobId);
        const totalExpected = currentJob?.total || imageUrls.length;
        
        // Update with accumulated values (updateJob will handle accumulation)
        updateJob(jobId, {
          status: "processing", // Keep as processing until all events complete
          products: accumulator.products,
          processed: accumulator.processed, // This will be accumulated by updateJob
          failed: accumulator.failed, // This will be accumulated by updateJob
        });
        
        // Check if all events are complete after accumulation
        const updatedJob = getJob(jobId);
        if (updatedJob) {
          const totalProcessed = (updatedJob.processed || 0) + (updatedJob.failed || 0);
          
          // Only mark as completed if we've processed all expected images
          if (totalExpected > 0 && totalProcessed >= totalExpected) {
            updateJob(jobId, {
              status: "completed",
            });
            console.log(`✅ [Inngest] All events completed for job ${jobId}: ${updatedJob.processed || 0} processed, ${updatedJob.failed || 0} failed out of ${totalExpected} total`);
          } else {
            console.log(`⏳ [Inngest] Event completed for job ${jobId}: ${updatedJob.processed || 0}/${totalExpected} processed so far`);
          }
        }
      }

      return {
        status: "completed",
        jobId,
        totalImages: imageUrls.length,
        products: accumulator.products, // Already limited to MAX_STORED_PRODUCTS
        processed: accumulator.processed,
        failed: accumulator.failed,
        failedUrls: accumulator.failedUrls, // Already limited to MAX_FAILED_URLS
      };
    } catch (error) {
      // Handle job failure
      console.error(`❌ [Inngest] Job ${jobId} failed:`, error);
      
      if (hasJob(jobId)) {
        updateJob(jobId, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        // Create job if it doesn't exist (process isolation)
        console.log(`⚠️ [Inngest] Job ${jobId} not found in store (error handler), creating it`);
        setJob(jobId, {
          status: "failed",
          total: imageUrls.length,
          processed: 0,
          failed: 0,
          products: [],
          error: error instanceof Error ? error.message : String(error),
          createdAt: Date.now(),
        });
      }
      
      // Re-throw to let Inngest handle retries
      throw error;
    }
  }
);

