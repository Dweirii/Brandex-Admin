import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import prismadb from "@/lib/prismadb";
import { serializeProduct } from "@/lib/serialize-product";

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

    const product = await prismadb.product.findUnique({
      where: { id: productId },
      include: {
        Image: true,
        category: true,
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

    const { price } = body;

    // Basic validation
    if (!userId) return new NextResponse("Unauthenticated", { status: 401 });
    if (!storeId) return new NextResponse("Store ID is required", { status: 400 });
    if (!productId) return new NextResponse("Product ID is required", { status: 400 });
    if (price === undefined || price === null) return new NextResponse("Price is required", { status: 400 });
    if (typeof price !== "number" || price < 0) return new NextResponse("Price must be a non-negative number", { status: 400 });

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
    const existingProduct = await prismadb.product.findFirst({
      where: {
        id: productId,
        storeId,
      },
    });

    if (!existingProduct) {
      return new NextResponse("Product not found", { status: 404 });
    }

    // Update product
    const product = await prismadb.product.update({
      where: {
        id: productId,
      },
      data: {
        price,
      },
    });

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
    const existingProduct = await prismadb.product.findFirst({
      where: {
        id: productId,
        storeId,
      },
    });

    if (!existingProduct) {
      return new NextResponse("Product not found", { status: 404 });
    }

    // Delete product
    await prismadb.product.delete({
      where: {
        id: productId,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error in DELETE--Products", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
