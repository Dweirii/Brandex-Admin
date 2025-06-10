// app/api/[storeId]/products/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

export async function GET(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } =await params;
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");

  if (!query || !storeId) {
    return new NextResponse(JSON.stringify({ error: "Missing query or storeId" }), {
      status: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    });
  }

  try {
    const products = await prismadb.product.findMany({
      where: {
        storeId,
        isArchived: false,
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { keywords: { has: query.toLowerCase() } },
        ],
      },
      include: {
        Image: true, // Prisma relation for product images
        category: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Rename Image[] to images[] for frontend compatibility
    const normalized = products.map((product) => ({
      ...product,
      images: product.Image,
    }));

    return new NextResponse(JSON.stringify({ results: normalized }), {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Search error:", error);
    return new NextResponse(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    });
  }
}
