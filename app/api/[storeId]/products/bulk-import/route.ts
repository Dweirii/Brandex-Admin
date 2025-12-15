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
    const CHUNK_SIZE = 500; // Send chunks of 500 items per event to avoid state size limits
    const totalChunks = Math.ceil(items.length / CHUNK_SIZE);

    console.log(`📦 Starting bulk import for store ${storeId}`);
    console.log(`📊 Total items: ${items.length}, Will be sent in ${totalChunks} events of ${CHUNK_SIZE}`);

    // Send items in chunks to avoid state size limits and improve performance
    const events = [];
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      events.push({
        name: "bulk.import" as const,
        data: {
          storeId,
          items: chunk,
        },
      });
    }

    console.log(`📤 Sending ${items.length} items to Inngest in ${events.length} events`);

    // Send all events in parallel for faster processing
    await Promise.all(events.map(event => inngest.send(event)));

    console.log(`✅ All ${items.length} items sent to Inngest successfully in ${events.length} events`);

    return NextResponse.json({
      success: true,
      processed: items.length,
      failed: 0,
      errors: [],
      failedRows: [],
      message: `Import queued: ${items.length} products sent for processing in ${events.length} batches`
    });
  } catch (error) {
    console.error("❌ Bulk import error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
