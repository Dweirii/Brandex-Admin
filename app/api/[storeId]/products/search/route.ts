// app/api/[storeId]/products/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";

export async function GET(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } =await params;
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");

  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "24", 10);

  if (!query || !storeId) {
    return new NextResponse(
      JSON.stringify({ error: "Missing query or storeId" }), {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const matchingCategories = await prismadb.category.findMany({
      where: {
        storeId,
        name: {
          contains: query,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
    });

    const categoryIds = matchingCategories.map((category) => category.id);

    const whereClause: any = {
      storeId,
      isArchived: false,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { keywords: { has: query.toLowerCase() } },
      ],
    };

    if (categoryIds.length > 0) {
      whereClause.OR.push({ categoryId: { in: categoryIds } });
    }

    const [products, total] = await Promise.all([
      prismadb.product.findMany({
        where: whereClause,
        include: {
          Image: true,
          category: true,
        },
        orderBy: { downloadsCount: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prismadb.product.count({
        where: whereClause,
      }),
    ]);

    const normalizedProducts = products.map((product) => ({
      ...product,
      images: product.Image,
    }));

    const pageCount = Math.ceil(total / limit);

    return new NextResponse(
      JSON.stringify({
        results: normalizedProducts, 
        total, 
        page, 
        pageCount, 
        limit, 
      }),
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Search error:", error);
    return new NextResponse(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  }
}