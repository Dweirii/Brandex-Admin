import { NextRequest, NextResponse } from "next/server"
import { getJob } from "@/lib/job-store"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    await params // storeId available if needed for future use
    const { searchParams } = new URL(req.url)
    const jobId = searchParams.get("jobId")

    if (!jobId) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 })
    }

    const job = getJob(jobId)

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    return NextResponse.json({
      jobId,
      status: job.status,
      products: job.products || [],
      processed: job.processed || 0,
      failed: job.failed || 0,
      total: job.total || 0,
      error: job.error,
      createdAt: job.createdAt,
    })
  } catch (error) {
    console.error("Get job status error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}

