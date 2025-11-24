// app/api/[storeId]/products/search/autocomplete/route.ts
import { NextRequest, NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");
  const limit = parseInt(searchParams.get("limit") || "10", 10);

  if (!query || !storeId || query.trim().length < 1) {
    return new NextResponse(
      JSON.stringify({ suggestions: [] }), {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const normalizedQuery = query.trim().toLowerCase();

    // For autocomplete, we want to find products that start with the query
    // This helps with partial matches like "ca" -> "car", "card", "canvas"
    const whereClause: Prisma.ProductWhereInput = {
      storeId,
      isArchived: false,
      OR: [
        // Name starts with query
        { name: { startsWith: query.trim(), mode: "insensitive" } },
        // Keywords that start with query
        { keywords: { hasSome: [normalizedQuery] } },
      ],
    };

    // Fetch products matching the prefix
    const products = await prismadb.products.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        keywords: true,
      },
      take: limit * 2, // Get more to filter and rank
    });

    // Extract unique suggestions from product names and keywords
    const suggestionsSet = new Set<string>();
    
    products.forEach((product) => {
      // Add product name if it starts with query
      if (product.name.toLowerCase().startsWith(normalizedQuery)) {
        suggestionsSet.add(product.name);
      }

      // Add keywords that start with query
      if (product.keywords) {
        product.keywords.forEach((keyword: string) => {
          if (keyword.toLowerCase().startsWith(normalizedQuery)) {
            suggestionsSet.add(keyword);
          }
        });
      }
    });

    // Convert to array and sort (prioritize shorter, exact matches)
    const suggestions = Array.from(suggestionsSet)
      .sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        
        // Exact match first
        if (aLower === normalizedQuery) return -1;
        if (bLower === normalizedQuery) return 1;
        
        // Shorter matches first
        if (aLower.startsWith(normalizedQuery) && !bLower.startsWith(normalizedQuery)) return -1;
        if (bLower.startsWith(normalizedQuery) && !aLower.startsWith(normalizedQuery)) return 1;
        
        // Then by length
        return a.length - b.length;
      })
      .slice(0, limit);

    return new NextResponse(
      JSON.stringify({ suggestions }), {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Autocomplete error:", error);
    return new NextResponse(
      JSON.stringify({ suggestions: [] }),
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  }
}

