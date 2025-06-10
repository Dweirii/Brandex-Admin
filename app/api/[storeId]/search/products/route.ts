import  prismadb  from '@/lib/prismadb';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const storeId = (await params).storeId;

  if (!query || !storeId) {
    return NextResponse.json({ error: 'Missing query or storeId' }, { status: 400 });
  }

  try {
    const results = await prismadb.$queryRawUnsafe(`
      SELECT * FROM "products"
      WHERE "storeId" = $1
        AND to_tsvector('english',
              coalesce("name", '') || ' ' ||
              coalesce("description", '') || ' ' ||
              array_to_string("keywords", ' ')
            )
        @@ plainto_tsquery('english', $2)
      ORDER BY "createdAt" DESC
      LIMIT 50;
    `, storeId, query);

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
