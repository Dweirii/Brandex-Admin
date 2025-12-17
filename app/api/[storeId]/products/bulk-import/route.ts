import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/app/inngest/inngest";
import prismadb from "@/lib/prismadb";
import { auth } from "@clerk/nextjs/server";

export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest, { params }: { params: Promise<{ storeId: string }> }) {
  try {
    const body = await req.json();
    const { items } = body;

    if (!items || !Array.isArray(items)) {
      console.error("❌ Invalid payload: items is not an array");
      return new NextResponse("Invalid payload", { status: 400 });
    }

    const storeId = (await params).storeId;
    const { userId } = await auth();

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Create import log for tracking
    const importLog = await prismadb.product_import_logs.create({
      data: {
        id: crypto.randomUUID(),
        storeId,
        userId,
        fileName: "bulk-import.csv", // We could pass this from frontend if needed
        totalRows: items.length,
        status: "PROCESSING",
        startedAt: new Date(),
      },
    });

    const CHUNK_SIZE = 10; // Drastically reduced to 10 to ensure payload is tiny (~5KB) and avoid "Job input not found"
    const totalChunks = Math.ceil(items.length / CHUNK_SIZE);

    console.log(`📦 Starting bulk import for store ${storeId}, LogID: ${importLog.id}`);
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
          importId: importLog.id,
        },
      });
    }

    console.log(`📤 Sending ${items.length} items to Inngest in ${events.length} events`);

    // Send events in batches to avoid hitting API rate limits or body size limits
    const BATCH_SIZE = 5; // Reduced to 5 concurrent requests/events per batch for maximum safety
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE);
      await inngest.send(batch);
    }

    console.log(`✅ All ${items.length} items sent to Inngest successfully in ${events.length} events`);

    return NextResponse.json({
      success: true,
      importId: importLog.id,
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
