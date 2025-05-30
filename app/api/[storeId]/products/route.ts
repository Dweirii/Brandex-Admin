import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prismadb from "@/lib/prismadb";

// POST: Create a product
export async function POST(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await context.params; // Await params before destructuring
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
    } = body;

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    if (!name) {
      return new NextResponse("Name is required", { status: 400 });
    }

    if (!Image || !Image.length) {
      return new NextResponse("Image URL is required", { status: 400 });
    }

    if (!price) {
      return new NextResponse("Price is required", { status: 400 });
    }

    if (!categoryId) {
      return new NextResponse("Category is required", { status: 400 });
    }

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    const product = await prismadb.product.create({
      data: {
        name,
        price,
        categoryId,
        isArchived,
        isFeatured,
        storeId,
        description,
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

// GET: Retrieve products
export async function GET(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await context.params; // Await params before destructuring
    const { searchParams } = new URL(req.url);
    const categoryId = searchParams.get("categoryId") || undefined;
    const isFeatured = searchParams.get("isFeatured");

    if (!storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    const products = await prismadb.product.findMany({
      where: {
        storeId,
        categoryId,
        isFeatured: isFeatured ? true : undefined,
        isArchived: false,
      },
      include: {
        Image: true,
        category: true,
        
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(products);
  } catch (error) {
    console.error("Error in GET--Products", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
