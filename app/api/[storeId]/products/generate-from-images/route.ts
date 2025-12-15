import { NextRequest, NextResponse } from "next/server"
import { inngest } from "@/app/inngest/inngest"
import { setJob } from "@/lib/job-store"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await params
    const body = await req.json()
    const { imageUrls, categoryId, price, useInngest } = body

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json({ error: "Image URLs are required" }, { status: 400 })
    }

    // Handle "free" as 0
    const normalizedPrice = typeof price === "string" ? price.toLowerCase().trim() : String(price)
    const priceValue = normalizedPrice === "free" ? 0 : Number(price)
    
    if (price === "" || (normalizedPrice !== "free" && isNaN(priceValue))) {
      return NextResponse.json({ error: "Valid price is required (number or 'free')" }, { status: 400 })
    }

    if (priceValue < 0 || priceValue > 999999.99) {
      return NextResponse.json({ error: "Price must be between 0 and 999,999.99" }, { status: 400 })
    }

    if (!categoryId) {
      return NextResponse.json({ error: "Category ID is required" }, { status: 400 })
    }

    // Use Inngest for large batches (100+ URLs) or if explicitly requested
    const USE_INNGEST_THRESHOLD = 100
    const shouldUseInngest = useInngest === true || imageUrls.length >= USE_INNGEST_THRESHOLD

    if (shouldUseInngest) {
      // Queue job to Inngest for background processing
      const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(7)}`
      
      // Initialize job status with all required fields
      setJob(jobId, {
        status: "pending",
        total: imageUrls.length,
        processed: 0,
        failed: 0,
        products: [],
        createdAt: Date.now(),
      })

      // Chunk image URLs to avoid state size limits (500 URLs per event)
      const CHUNK_SIZE = 500;
      const totalChunks = Math.ceil(imageUrls.length / CHUNK_SIZE);
      
      console.log(`📤 Queuing ${imageUrls.length} images to Inngest (job: ${jobId}) in ${totalChunks} chunks`)

      // Send events in chunks
      const events = [];
      for (let i = 0; i < imageUrls.length; i += CHUNK_SIZE) {
        const chunk = imageUrls.slice(i, i + CHUNK_SIZE);
        events.push({
          name: "products.generate-from-images" as const,
          data: {
            storeId,
            imageUrls: chunk,
            categoryId,
            price: priceValue,
            jobId,
          },
        });
      }

      // Send all events in parallel for faster processing
      await Promise.all(events.map(event => inngest.send(event)))

      return NextResponse.json({
        success: true,
        jobId,
        queued: true,
        message: `Job queued successfully. Processing ${imageUrls.length} images in the background in ${totalChunks} batches.`,
        total: imageUrls.length,
      })
    }

    // For smaller batches, process directly (existing logic)
    const MAX_BATCH_SIZE = 20
    if (imageUrls.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size too large. Maximum ${MAX_BATCH_SIZE} URLs per request. Use Inngest for larger batches.` },
        { status: 400 }
      )
    }

    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured. Please set OPENAI_API_KEY in your environment variables." },
        { status: 500 }
      )
    }

    type Product = {
      name: string
      description: string
      price: string
      categoryId: string
      imageUrl: string
      downloadUrl: string
      keywords: string[]
    }

    const products: Product[] = []
    const failedUrls: string[] = []

    // Process each image URL with concurrency control
    const processImage = async (imageUrl: string): Promise<{ success: boolean; url: string; error?: string }> => {
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
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          console.error(`OpenAI API error for ${imageUrl}:`, errorData)
          failedUrls.push(imageUrl)
          return { success: false, url: imageUrl, error: "OpenAI API error" }
        }

        const data = await response.json()
        const content = data.choices?.[0]?.message?.content

        if (!content) {
          console.error(`No content returned for ${imageUrl}`)
          failedUrls.push(imageUrl)
          return { success: false, url: imageUrl, error: "No content returned" }
        }

        // Parse JSON response (handle code blocks if present)
        let productData
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            productData = JSON.parse(jsonMatch[0])
          } else {
            productData = JSON.parse(content)
          }
        } catch (parseError) {
          console.error(`Failed to parse OpenAI response for ${imageUrl}:`, parseError)
          // Fallback: create basic product from URL
          const urlParts = imageUrl.split("/").pop() || "Product"
          const baseName = urlParts.split(".")[0].replace(/[-_]/g, " ")
          productData = {
            name: baseName.charAt(0).toUpperCase() + baseName.slice(1),
            description: `Product image: ${urlParts}`,
            keywords: "product,digital",
          }
        }

        // Ensure required fields
        const product: Product = {
          name: productData.name || `Product ${products.length + 1}`,
          description: productData.description || "",
          price: String(priceValue),
          categoryId,
          imageUrl,
          downloadUrl: imageUrl, // Same as imageUrl as requested
          keywords: productData.keywords
            ? productData.keywords.split(",").map((k: string) => k.trim()).filter(Boolean)
            : [],
        }

        // Validate name length
        if (product.name.length > 100) {
          product.name = product.name.substring(0, 97) + "..."
        }

        // Validate description length
        if (product.description.length > 1000) {
          product.description = product.description.substring(0, 997) + "..."
        }

        products.push(product)
        return { success: true, url: imageUrl }
      } catch (error) {
        console.error(`Error processing image ${imageUrl}:`, error)
        failedUrls.push(imageUrl)
        return { success: false, url: imageUrl, error: error instanceof Error ? error.message : "Unknown error" }
      }
    }

    // Process images with limited concurrency (5 at a time) to avoid rate limits
    const CONCURRENT_LIMIT = 5
    for (let i = 0; i < imageUrls.length; i += CONCURRENT_LIMIT) {
      const batch = imageUrls.slice(i, i + CONCURRENT_LIMIT)
      await Promise.all(batch.map((url) => processImage(url)))
      
      // Small delay between batches to respect rate limits
      if (i + CONCURRENT_LIMIT < imageUrls.length) {
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }

    if (products.length === 0) {
      return NextResponse.json(
        { error: "Failed to generate any products. Please check your image URLs and OpenAI API key." },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      products,
      generated: products.length,
      total: imageUrls.length,
      failed: failedUrls.length,
      failedUrls: failedUrls.slice(0, 10), // Return first 10 failed URLs for debugging
    })
  } catch (error) {
    console.error("Generate products error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

