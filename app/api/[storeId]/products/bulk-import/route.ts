import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/app/inngest/inngest";

export async function POST(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const body = await req.json(); 
    const { items } = body;

    if (!items || !Array.isArray(items)) {
      console.error("❌ Invalid payload: items is not an array");
      return new NextResponse("Invalid payload", { status: 400 });
    }

    const storeId = (await params).storeId;
    const totalChunks = Math.ceil(items.length / 100); // Chunk size is handled in Inngest function

    console.log(`📦 Starting bulk import for store ${storeId}`);
    console.log(`📊 Total items: ${items.length}, Will be processed in ${totalChunks} chunks of 100`);

    // Send ALL items in ONE event - Inngest function will handle chunking internally
    console.log(`📤 Sending ${items.length} items to Inngest (will be chunked internally)`);

    await inngest.send({
      name: "bulk.import",
      data: {
        storeId,
        items: items, // Send all items, not chunks
      },
    });

    console.log(`✅ All ${items.length} items sent to Inngest successfully`);
    console.log(`⏳ Inngest is processing ${items.length} items in ${totalChunks} chunks of 100`);

    return NextResponse.json({
      success: true,
      processed: items.length,
      failed: 0,
      errors: [],
      failedRows: [],
      message: `Import queued: ${items.length} products sent for processing`
    });
  } catch (error) {
    console.error("❌ Bulk import error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
