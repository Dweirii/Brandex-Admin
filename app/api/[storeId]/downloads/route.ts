import { NextRequest, NextResponse } from "next/server"
import prismadb from "@/lib/prismadb"

// Dynamic CORS headers based on origin
const getCorsHeaders = (origin: string | null) => {
  const allowedOrigins = [
    "https://brandexme.com",
    "https://www.brandexme.com",
    "http://localhost:3000",
    "http://localhost:3001",
  ]
  
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : "*"
  
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-user-id, Authorization",
    "Access-Control-Allow-Credentials": allowOrigin !== "*" ? "true" : "false",
    "Access-Control-Max-Age": "86400", // 24 hours
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const origin = req.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)
  
  const { storeId } = await context.params
  const userId = req.headers.get("x-user-id")
  const categoryId = req.nextUrl.searchParams.get("category")

  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401, headers: corsHeaders })
  }

  if (!storeId) {
    return new NextResponse("Store ID is required", { status: 400, headers: corsHeaders })
  }

  try {
    const downloads = await prismadb.downloads.findMany({
    where: {
      userId,
      storeId,
      ...(categoryId && {
        products: {
          categoryId,
        },
      }),
    },
    include: {
      products: {
        include: {
          Category: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })

    const formattedDownloads = downloads.map((download) => ({
      id: download.id,
      productId: download.productId,
      productName: download.products.name,
      categoryId: download.products.categoryId,
      categoryName: download.products.Category.name,
      storeId: download.storeId,
      isFree: download.isFree,
      createdAt: download.createdAt.toISOString(),
      price: download.products.price.toNumber(),
    }))

    return NextResponse.json(formattedDownloads, { headers: corsHeaders })
  } catch (error) {
    console.error("[DOWNLOAD_GET_ERROR]", error)
    return new NextResponse(
      error instanceof Error ? error.message : "Internal Server Error",
      { status: 500, headers: corsHeaders }
    )
  }
}

// Handle preflight OPTIONS
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)
  
  const res = new NextResponse(null, { status: 204 })
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.headers.set(key, value)
  })
  return res
}

