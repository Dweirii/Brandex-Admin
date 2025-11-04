import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prismadb from "@/lib/prismadb";

// POST: Create a product
export async function POST(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
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

    if (!userId) return new NextResponse("Unauthenticated", { status: 401 });
    if (!name) return new NextResponse("Name is required", { status: 400 });
    if (!Image || !Image.length)
      return new NextResponse("Image URL is required", { status: 400 });
    if (!price) return new NextResponse("Price is required", { status: 400 });
    if (!categoryId) return new NextResponse("Category is required", { status: 400 });
    if (!storeId) return new NextResponse("Store ID is required", { status: 400 });


    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    const existingProduct = await prismadb.product.findFirst({
      where: {
        storeId,
        name: name.trim(),
      },
    });

    if (existingProduct) {
      return new NextResponse("Product with this name already exists.", { status: 409 });
    }

    const product = await prismadb.product.create({
      data: {
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
      },
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error("Error in POST--Products", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
// GET: Retrieve products with pagination
export async function GET(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await context.params;
    const { searchParams } = new URL(req.url);

    const categoryId = searchParams.get("categoryId") || undefined;
    const isFeatured = searchParams.get("isFeatured");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "12", 10);

    const priceFilter = searchParams.get("priceFilter") || undefined;

    const sortBy = searchParams.get("sortBy") || "mostPopular";

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    if (priceFilter && !['paid', 'free', 'all'].includes(priceFilter)) {
      return new NextResponse(
        JSON.stringify({ error: "Invalid priceFilter. Must be 'free', 'paid', or 'all'" }),
        { 
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const validSortOptions = ['mostPopular', 'priceLow', 'priceHigh', 'nameAsc', 'nameDesc', 'newest', 'oldest'];

    if(sortBy && !validSortOptions.includes(sortBy)) {
      return new NextResponse(
        JSON.stringify({
          error: "Invalid sortBy. Must be one of: " + validSortOptions.join(", ")
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const whereClause: any = {
      storeId,
      isArchived: false,
    };

    if (categoryId) {
      whereClause.categoryId = categoryId;
    }

    if (isFeatured) {
      whereClause.isFeatured = true;
    }

    if(priceFilter === "Free") {
      whereClause.price = {equals: 0}
    } else if (priceFilter === "Paid") {
      whereClause.price = { gt: 0 };
    }

    let orderBy: any = {};
    
    switch(sortBy) {
      case 'mostPopular':
        orderBy = { downloadCount: 'desc'};
        break;   
      case 'priceLow':
        orderBy = { price :'asc'};
        break;
      case 'priceHigh':
        orderBy = { price :'desc'};
        break;
      case 'nameAsc':
        orderBy = { name :'asc'};
        break;
      case 'nameDesc':
        orderBy = { name :'desc'};
        break;
      case 'newest':
        orderBy = { createdAt :'desc'};
        break;
      case 'oldest':
        orderBy = { createdAt :'asc'};
        break;
      default:
        orderBy = { downloadCount: 'desc'};
        break;
    }

    const [products, total] = await Promise.all([
      prismadb.product.findMany({
        where: whereClause,
        include: {
          Image: true,
          category: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prismadb.product.count({
        where: whereClause,
      }),
    ]);

    const pageCount = Math.ceil(total / limit);

    return NextResponse.json({
      products,
      total,
      page,
      pageCount,
    });
  } catch (error) {
    console.error("Error in GET--Products", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

// DELETE: Delete all products for a store
export async function DELETE(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await context.params;
    const { userId } = await auth();

    if (!userId) return new NextResponse("Unauthenticated", { status: 401 });
    if (!storeId) return new NextResponse("Store ID is required", { status: 400 });

    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    const deleteResult = await prismadb.product.deleteMany({
      where: {
        storeId,
      },
    });

    return NextResponse.json({
      message: `Successfully deleted ${deleteResult.count} products`,
      deletedCount: deleteResult.count,
    });
  } catch (error) {
    console.error("Error in DELETE--Products", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
