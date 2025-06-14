import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/app/inngest/inngest";

export async function POST(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const body = await req.json(); 
    const { items } = body;

    if (!items || !Array.isArray(items)) {
      return new NextResponse("Invalid payload", { status: 400 });
    }

    const storeId = (await params).storeId;
    const CHUNK_SIZE = 100;

    for(let i = 0; i<items.length; i+= CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);

      await inngest.send({
        name: "bulk.import",
        data: {
          storeId,
          items,
        },
      });
    }

    return NextResponse.json({
      success: true,
      processed: items.length,
      failed: 0,
      errors: [],
      failedRows: [],
    });
  } catch (error) {
    console.error("Bulk import error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
