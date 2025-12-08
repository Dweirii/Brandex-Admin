import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prismadb from "@/lib/prismadb";
import { Prisma } from "@prisma/client";


const getCorsHeaders = (origin: string | null) => {
  const allowedOrigins = [
    "https://brandexme.com",
    "https://www.brandexme.com",
    "http://localhost:3000",
    "http://localhost:3001",
  ];

  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": allowOrigin !== "*" ? "true" : "false",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
};

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(origin),
  });
}

// POST: Create a product
export async function POST(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { storeId } = await context.params;
    const { userId } = await auth();
    const body = await req.json();

    const {
      name,
      price,
      categoryId,
      Image,
      isFeatured,
      isArchived,
      description,
      downloadUrl,
      videoUrl,
      keywords,
    } = body;

    if (!userId) return new NextResponse("Unauthenticated", { status: 401, headers: corsHeaders });
    if (!name) return new NextResponse("Name is required", { status: 400, headers: corsHeaders });
    if (!Image || !Image.length)
      return new NextResponse("Image URL is required", { status: 400, headers: corsHeaders });

    if (!price) return new NextResponse("Price is required", { status: 400, headers: corsHeaders });
    if (!categoryId) return new NextResponse("Category is required", { status: 400, headers: corsHeaders });
    if (!storeId) return new NextResponse("Store ID is required", { status: 400, headers: corsHeaders });


    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403, headers: corsHeaders });
    }

    const existingProduct = await prismadb.products.findFirst({
      where: {
        storeId,
        name: name.trim(),
      },
    });

    if (existingProduct) {
      return new NextResponse("Product with this name already exists.", { status: 409, headers: corsHeaders });
    }

    const product = await prismadb.products.create({
      data: {
        id: crypto.randomUUID(),
        name: name.trim(),
        price,
        categoryId,
        isArchived,
        isFeatured,
        storeId,
        description,
        downloadUrl,
        videoUrl,
        keywords,
        Image: {
          createMany: {
            data: Image.map((img: { url: string }) => img),
          },
        },
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(product, { headers: corsHeaders });
  } catch (error) {
    console.error("Error in POST--Products", error);
    return new NextResponse("Internal server error", { status: 500, headers: corsHeaders });
  }
}

// GET: Retrieve products with pagination
export async function GET(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { storeId } = await context.params;
    const { searchParams } = new URL(req.url);

    const categoryId = searchParams.get("categoryId") || undefined;
    const isFeatured = searchParams.get("isFeatured");
    const page = parseInt(searchParams.get("page") || "1", 10);
    // Align API default page size with storefront (24 items)
    const limit = parseInt(searchParams.get("limit") || "24", 10);

    const priceFilter = searchParams.get("priceFilter") || undefined;

    const sortBy = searchParams.get("sortBy") || "mostPopular";

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400, headers: corsHeaders });
    }

    if (priceFilter && !['paid', 'free', 'all'].includes(priceFilter)) {
      return new NextResponse(
        JSON.stringify({ error: "Invalid priceFilter. Must be 'free', 'paid', or 'all'" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        }
      );
    }

    const validSortOptions = ['mostPopular', 'priceLow', 'priceHigh', 'nameAsc', 'nameDesc', 'newest', 'oldest'];

    if (sortBy && !validSortOptions.includes(sortBy)) {
      return new NextResponse(
        JSON.stringify({
          error: "Invalid sortBy. Must be one of: " + validSortOptions.join(", ")
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        }
      );
    }

    const whereClause: Prisma.productsWhereInput = {
      storeId,
      isArchived: false,
      // only include products that have media the UI can render
      AND: [
        {
          OR: [
            { Image: { some: { url: { not: "" } } } },
            { videoUrl: { not: null } },
          ],
        },
      ],
    };

    if (categoryId) {
      whereClause.categoryId = categoryId;
    }

    if (priceFilter === "free") {
      whereClause.price = { equals: 0 }
    } else if (priceFilter === "paid") {
      whereClause.price = { gt: 0 };
    }

    let orderBy: Prisma.productsOrderByWithRelationInput = {};

    switch (sortBy) {
      case 'mostPopular':
        orderBy = { downloadsCount: 'desc' };
        break;
      case 'priceLow':
        orderBy = { price: 'asc' };
        break;
      case 'priceHigh':
        orderBy = { price: 'desc' };
        break;
      case 'newest':
        orderBy = { createdAt: 'desc' };
        break;
      case 'oldest':
        orderBy = { createdAt: 'asc' };
        break;
      default:
        orderBy = { downloadsCount: 'desc' };
        break;
    }

    const [products, total] = await Promise.all([
      prismadb.products.findMany({
        where: whereClause,
        include: {
          Image: true,
          Category: true,
        },
        orderBy: orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prismadb.products.count({
        where: whereClause,
      }),
    ]);

    const pageCount = Math.ceil(total / limit);

    return NextResponse.json({
      products,
      total,
      page,
      pageCount,
      limit,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Error in GET--Products", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new NextResponse(JSON.stringify({ error: errorMessage, details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

// DELETE: Delete all products for a store
export async function DELETE(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { storeId } = await context.params;
    const { userId } = await auth();

    if (!userId) return new NextResponse("Unauthenticated", { status: 401, headers: corsHeaders });
    if (!storeId) return new NextResponse("Store ID is required", { status: 400, headers: corsHeaders });

    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403, headers: corsHeaders });
    }

    const deleteResult = await prismadb.products.deleteMany({
      where: {
        storeId,
      },
    });

    return NextResponse.json({
      message: `Successfully deleted ${deleteResult.count} products`,
      deletedCount: deleteResult.count,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Error in DELETE--Products", error);
    return new NextResponse("Internal server error", { status: 500, headers: corsHeaders });
  }
}
