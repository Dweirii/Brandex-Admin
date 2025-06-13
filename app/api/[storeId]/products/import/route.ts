export const runtime = "nodejs";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { parse } from "csv-parse/sync";
import { Decimal } from "@prisma/client/runtime/library";
import prismadb from "@/lib/prismadb";
import { validateProductBatch } from "@/lib/validation/product-import-schema";

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 5;
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (userLimit.count >= maxRequests) return false;

  userLimit.count++;
  return true;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  try {
    const { storeId } = await context.params;
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    if (request.headers.get("X-Requested-With") !== "XMLHttpRequest") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const store = await prismadb.store.findFirst({
      where: { id: storeId, userId }
    });
    if (!store) {
      return NextResponse.json(
        { error: "Store not found or access denied" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file || !file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ error: "Only CSV files are allowed" }, { status: 400 });
    }
    if (file.size === 0 || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Invalid file size" }, { status: 400 });
    }

    const csvText = await file.text();
    let records: unknown[];
    try {
      records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
    } catch {
      return NextResponse.json({ error: "CSV parsing failed" }, { status: 400 });
    }

    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: "CSV file contains no data rows" }, { status: 400 });
    }
    if (records.length > 10000) {
      return NextResponse.json({ error: "CSV file contains too many rows (max 10,000)" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { validRows, errors } = validateProductBatch(records as any[]);
    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        processed: 0,
        failed: errors.length,
        errors,
        failedRows: records.filter((_, i) => errors.some(e => e.row === i + 1))
      });
    }

    // Preload categories to speed up validation
    const categoryIds = Array.from(new Set(validRows.map(r => r.categoryId)));
    const existingCategories = await prismadb.category.findMany({
      where: { id: { in: categoryIds }},
      select: { id: true }
    });
    const existingSet = new Set(existingCategories.map(c => c.id));

    const importLogId = crypto.randomUUID();
    await prismadb.productImportLog.create({
      data: {
        id: importLogId,
        storeId,
        userId,
        fileName: file.name,
        fileSize: file.size,
        totalRows: validRows.length,
        status: "PROCESSING",
        startedAt: new Date()
      }
    });

    let processedCount = 0;
    const failedRows: unknown[] = [];
    const processingErrors: string[] = [];
    const startTime = Date.now();

    const batchSize = 100;
    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize);
      try {
        await prismadb.$transaction(async tx => {
          for (const row of batch) {
            if (!existingSet.has(row.categoryId)) {
              throw new Error(`Category ID not found: ${row.categoryId}`);
            }
            const product = await tx.product.upsert({
              where: { storeId_name: { storeId, name: row.name } },
              update: {
                description: row.description,
                price: new Decimal(row.price),
                categoryId: row.categoryId,
                downloadUrl: row.downloadUrl || null,
                isFeatured: row.isFeatured,
                isArchived: row.isArchived,
                keywords: row.keywords,
                updatedAt: new Date()
              },
              create: {
                storeId,
                name: row.name,
                description: row.description,
                price: new Decimal(row.price),
                categoryId: row.categoryId,
                downloadUrl: row.downloadUrl || null,
                isFeatured: row.isFeatured,
                isArchived: row.isArchived,
                keywords: row.keywords
              }
            });
            if (row.imageUrl) {
              await tx.image.create({
                data: {
                  url: row.imageUrl,
                  product: { connect: { id: product.id } }
                }
              });
            }
            processedCount++;
          }
        }, { timeout: 60000 });
      } catch (batchError) {
        console.error(`Batch starting at ${i} failed`, batchError);
        batch.forEach(row => {
          failedRows.push(row);
          processingErrors.push(`Row ${row.name}: ${String(batchError)}`);
        });
      }
    }

    const processingTime = Date.now() - startTime;
    await prismadb.productImportLog.update({
      where: { id: importLogId },
      data: {
        processedRows: processedCount,
        failedRows: failedRows.length,
        status: failedRows.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
        errorMessage: processingErrors.join("; ") || null,
        processingTimeMs: processingTime,
        completedAt: new Date()
      }
    });

    return NextResponse.json({
      success: failedRows.length === 0,
      processed: processedCount,
      failed: failedRows.length,
      errors: processingErrors.map((msg, idx) => ({ row: idx + 1, field: "processing", message: msg })),
      failedRows,
      importLogId
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Internal server error. Please try again later." }, { status: 500 });
  }
}
