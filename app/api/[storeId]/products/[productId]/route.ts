import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prismadb from "@/lib/prismadb";
import { serializeProduct } from "@/lib/serialize-product";
import { syncProductToTypesense, deleteProductFromTypesense } from "@/lib/sync-product-to-typesense";

// GET a single product
export async function GET(
  req: Request,
  context: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await context.params;

    if (!productId) {
      return new NextResponse("Product id is required", { status: 400 });
    }

    const product = await prismadb.products.findUnique({
      where: { id: productId },
      include: {
        Image: true,
        Category: true,
      },
    });

    if (!product) {
      return new NextResponse("Product not found", { status: 404 });
    }

    return NextResponse.json(serializeProduct(product));
  } catch (error) {
    console.error("[Product_GET]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

// PATCH: Update a product
export async function PATCH(
  req: Request,
  context: { params: Promise<{ storeId: string; productId: string }> }
) {
  try {
    const { storeId, productId } = await context.params;
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

    // Basic validation
    if (!userId) return new NextResponse("Unauthenticated", { status: 401 });
    if (!storeId) return new NextResponse("Store ID is required", { status: 400 });
    if (!productId) return new NextResponse("Product ID is required", { status: 400 });

    if (!name) return new NextResponse("Name is required", { status: 400 });
    if (!Image || !Image.length) return new NextResponse("Image URL is required", { status: 400 });
    if (price === undefined || price === null) return new NextResponse("Price is required", { status: 400 });
    if (typeof price !== "number" || price < 0) return new NextResponse("Price must be a non-negative number", { status: 400 });
    if (!categoryId) return new NextResponse("Category is required", { status: 400 });

    // Check if user owns the store
    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Check if product exists and belongs to the store
    const existingProduct = await prismadb.products.findFirst({
      where: {
        id: productId,
        storeId,
      },
    });

    if (!existingProduct) {
      return new NextResponse("Product not found", { status: 404 });
    }

    // Update product
    await prismadb.products.update({
      where: {
        id: productId,
      },
      data: {
        name: name.trim(),
        price,
        categoryId,
        Image: {
          deleteMany: {},
        },
        isFeatured,
        isArchived,
        description,
        downloadUrl,
        videoUrl,
        keywords,
        updatedAt: new Date(),
      },
    });

    const product = await prismadb.products.update({
      where: {
        id: productId,
      },
      data: {
        Image: {
          createMany: {
            data: [
              ...Image.map((image: { url: string }) => ({
                id: crypto.randomUUID(),
                url: image.url,
                updatedAt: new Date(),
              })),
            ],
          },
        },
      },
      include: {
        Category: true,
      },
    });

    // Sync to Typesense (non-blocking)
    syncProductToTypesense(productId).catch(console.error);

    return NextResponse.json(product);
  } catch (error) {
    console.error("Error in PATCH--Products", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

// DELETE: Delete a product
export async function DELETE(
  req: Request,
  context: { params: Promise<{ storeId: string; productId: string }> }
) {
  try {
    const { storeId, productId } = await context.params;
    const { userId } = await auth();

    if (!userId) return new NextResponse("Unauthenticated", { status: 401 });
    if (!storeId) return new NextResponse("Store ID is required", { status: 400 });
    if (!productId) return new NextResponse("Product ID is required", { status: 400 });

    // Check if user owns the store
    const storeByUserId = await prismadb.store.findFirst({
      where: {
        id: storeId,
        userId,
      },
    });

    if (!storeByUserId) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Check if product exists and belongs to the store
    const existingProduct = await prismadb.products.findFirst({
      where: {
        id: productId,
        storeId,
      },
    });

    if (!existingProduct) {
      return new NextResponse("Product not found", { status: 404 });
    }

    // Delete product
    await prismadb.products.delete({
      where: {
        id: productId,
      },
    });

    // Delete from Typesense (non-blocking)
    deleteProductFromTypesense(productId).catch(console.error);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error in DELETE--Products", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
