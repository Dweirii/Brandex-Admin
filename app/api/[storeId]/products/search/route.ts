import { NextRequest, NextResponse } from "next/server";
import { typesenseSearch, PRODUCT_COLLECTION_NAME } from "@/lib/typesense";
import prismadb from "@/lib/prismadb";
import { filterProductsWithValidMedia } from "@/lib/utils/check-image-url";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");
  const categoryId = searchParams.get("categoryId");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "48", 10);

  if (!query || !storeId) {
    return NextResponse.json(
      { error: "Missing query or storeId" },
      {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }

  try {
    // Build Typesense filter
    let filterBy = `storeId:=${storeId} && isArchived:=false`;
    if (categoryId) {
      filterBy += ` && categoryId:=${categoryId}`;
    }

    // Search with Typesense (lightning fast!)
    const searchResults = await typesenseSearch
      .collections(PRODUCT_COLLECTION_NAME)
      .documents()
      .search({
        q: query,
        query_by: 'name,keywords,description',
        filter_by: filterBy,
        sort_by: '_text_match:desc,downloadsCount:desc',
        per_page: limit,
        page: page,
        prefix: true, // Enables "type-ahead" search
        num_typos: 2, // Allow up to 2 typos (handles "canva" -> "canvas")
        typo_tokens_threshold: 1,
        drop_tokens_threshold: 2,
        prioritize_exact_match: true,
        highlight_full_fields: 'name',
      });

    const total = searchResults.found;
    const pageCount = Math.ceil(total / limit);

    // Get product IDs from search results
    const productIds = searchResults.hits?.map(hit => (hit.document as { id: string }).id) || [];
    
    if (productIds.length === 0) {
      return NextResponse.json(
        {
          results: [],
          total: 0,
          page,
          pageCount: 0,
          limit,
        },
        {
          status: 200,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    // Fetch full product details from database
    // Only fetching what we need (24-48 products) instead of ALL matches!
    const products = await prismadb.products.findMany({
      where: { id: { in: productIds } },
      include: {
        Image: true,
        Category: true,
      },
    });

    // Maintain Typesense's search ranking order
    const orderedProducts = productIds
      .map(id => products.find(p => p.id === id))
      .filter(Boolean);

    // Filter out products with all 404 images
    const validProducts = await filterProductsWithValidMedia(orderedProducts);

    const normalizedProducts = validProducts.map(product => ({
      ...product,
      images: product.Image,
    }));

    return NextResponse.json(
      {
        results: normalizedProducts,
        total: validProducts.length, // Update total to reflect filtered count
        page,
        pageCount: Math.ceil(validProducts.length / limit),
        limit,
      },
      {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (error) {
    console.error("Typesense search error:", error);
    
    // Fallback to basic DB search if Typesense fails
    console.log("Falling back to database search...");
    try {
      const products = await prismadb.products.findMany({
        where: {
          storeId,
          isArchived: false,
          name: { contains: query, mode: "insensitive" },
          ...(categoryId && { categoryId }),
        },
        include: {
          Image: true,
          Category: true,
        },
        take: limit,
        skip: (page - 1) * limit,
      });

      // Filter out products with all 404 images
      const validProducts = await filterProductsWithValidMedia(products);

      return NextResponse.json(
        {
          results: validProducts.map(p => ({ ...p, images: p.Image })),
          total: validProducts.length,
          page,
          pageCount: Math.ceil(validProducts.length / limit),
          limit,
        },
        {
          status: 200,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    } catch (dbError) {
      console.error("Database fallback also failed:", dbError);
      return NextResponse.json(
        { error: "Search failed" },
        {
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }
  }
}
