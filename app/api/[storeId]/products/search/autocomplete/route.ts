import { NextRequest, NextResponse } from "next/server";
import { typesenseSearch, PRODUCT_COLLECTION_NAME } from "@/lib/typesense";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await params;
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");
  const categoryId = searchParams.get("categoryId");
  const limit = parseInt(searchParams.get("limit") || "10", 10);

  if (!query || !storeId || query.trim().length < 1) {
    return NextResponse.json(
      { suggestions: [] },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  try {
    let filterBy = `storeId:=${storeId} && isArchived:=false`;
    if (categoryId) {
      filterBy += ` && categoryId:=${categoryId}`;
    }

    const searchResults = await typesenseSearch
      .collections(PRODUCT_COLLECTION_NAME)
      .documents()
      .search({
        q: query,
        query_by: 'name,keywords',
        filter_by: filterBy,
        per_page: limit * 2, // Get more for deduplication
        prefix: true,
        num_typos: 1,
        prioritize_exact_match: true,
      });

    // Extract unique suggestions from product names
    const suggestionsSet = new Set<string>();
    searchResults.hits?.forEach(hit => {
      const doc = hit.document as { name: string };
      suggestionsSet.add(doc.name);
    });

    const suggestions = Array.from(suggestionsSet).slice(0, limit);

    return NextResponse.json(
      { suggestions },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (error) {
    console.error("Autocomplete error:", error);
    return NextResponse.json(
      { suggestions: [] },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
