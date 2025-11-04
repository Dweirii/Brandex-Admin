// app/api/[storeId]/products/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { Prisma } from "@prisma/client";

export async function GET(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
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
    // Normalize and split query into individual words for smart matching
    const normalizedQuery = query.trim().toLowerCase();
    const queryWords = normalizedQuery.split(/\s+/).filter(word => word.length >= 2);

    // Helper function to check if a word appears as a whole word (not substring)
    const isWholeWordMatch = (text: string, word: string): boolean => {
      const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(text);
    };

    // Build smart search conditions - use contains for initial filtering, then filter by whole words
    const searchConditions: Prisma.ProductWhereInput[] = [];

    // 1. Exact name match (highest priority)
    searchConditions.push({
      name: { equals: query.trim(), mode: "insensitive" }
    });

    // 2. Name starts with query (high priority) - only if it's a whole word at start
    if (queryWords.length === 1) {
      searchConditions.push({
        name: { startsWith: query.trim(), mode: "insensitive" }
      });
    }

    // 3. For initial database query, use contains to get potential matches
    // We'll filter by whole words in JavaScript after fetching
    queryWords.forEach(word => {
      if (word.length >= 2) {
        searchConditions.push({
          name: { contains: word, mode: "insensitive" }
        });
      }
    });

    // 4. Exact keyword match (high priority) - keywords are exact matches by design
    searchConditions.push({
      keywords: { has: normalizedQuery }
    });

    // 5. Search for keywords matching individual words
    queryWords.forEach(word => {
      if (word.length >= 2) {
        searchConditions.push({
          keywords: { has: word }
        });
      }
    });

    // Build the where clause
    const whereClause: Prisma.ProductWhereInput = {
      storeId,
      isArchived: false,
      OR: searchConditions,
    };

    // Fetch products and total count
    const [allProducts] = await Promise.all([
      prismadb.product.findMany({
        where: whereClause,
        include: {
          Image: true,
          category: true,
        },
      }),
    ]);

    // Filter products to only include those with whole word matches
    const filteredProducts = allProducts.filter((product) => {
      const productNameLower = product.name.toLowerCase();
      const productKeywords = (product.keywords || []).map((k: string) => k.toLowerCase());

      // Check if query matches as whole word in name
      if (queryWords.length === 1) {
        // Single word query - check if it's a whole word in name
        if (isWholeWordMatch(productNameLower, normalizedQuery)) {
          return true;
        }
      } else {
        // Multi-word query - check if all words appear as whole words
        const allWordsMatch = queryWords.every(word => isWholeWordMatch(productNameLower, word));
        if (allWordsMatch) {
          return true;
        }
      }

      // Check if query matches exactly in keywords
      if (productKeywords.includes(normalizedQuery)) {
        return true;
      }

      // Check if individual words match in keywords
      const keywordMatches = queryWords.some(word => productKeywords.includes(word));
      if (keywordMatches) {
        return true;
      }

      return false;
    });

    const total = filteredProducts.length;

    // Smart ranking: Calculate relevance score for each product
    const productsWithScore = filteredProducts.map((product) => {
      let score = 0;
      const productNameLower = product.name.toLowerCase();
      const productKeywords = (product.keywords || []).map((k: string) => k.toLowerCase());

      // Exact name match: highest score
      if (productNameLower === normalizedQuery) {
        score += 1000;
      }
      // Name starts with query as whole word
      else if (productNameLower.startsWith(normalizedQuery + ' ') || productNameLower === normalizedQuery) {
        score += 500;
      }
      // Name contains full query as whole word
      else if (isWholeWordMatch(productNameLower, normalizedQuery)) {
        score += 300;
      }

      // Check individual words in name (as whole words)
      queryWords.forEach((word) => {
        if (isWholeWordMatch(productNameLower, word)) {
          score += 100;
        }
      });

      // Exact keyword match
      if (productKeywords.includes(normalizedQuery)) {
        score += 400;
      }

      // Keyword contains individual words
      queryWords.forEach((word) => {
        if (productKeywords.includes(word)) {
          score += 50;
        }
      });

      // Boost popular products
      score += Math.log(product.downloadsCount + 1) * 10;

      return { product, score };
    });

    // Sort by score (descending), then by downloadsCount
    productsWithScore.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return b.product.downloadsCount - a.product.downloadsCount;
    });

    // Extract sorted products
    const sortedProducts = productsWithScore.map(({ product }) => product);

    // Apply pagination
    const paginatedProducts = sortedProducts.slice(
      (page - 1) * limit,
      page * limit
    );

    const normalizedProducts = paginatedProducts.map((product) => ({
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