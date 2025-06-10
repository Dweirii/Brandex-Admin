import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { parse } from "csv-parse/sync";
import prismadb from "@/lib/prismadb";
import { validateProductBatch } from "@/lib/validation/product-import-schema";
import { Decimal } from "@prisma/client/runtime/library";

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

  if (userLimit.count >= maxRequests) {
    return false;
  }

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

    const requestedWith = request.headers.get("X-Requested-With");
    if (requestedWith !== "XMLHttpRequest") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const store = await prismadb.store.findFirst({
      where: { id: storeId, userId },
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found or access denied" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ error: "Only CSV files are allowed" }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File size exceeds 5MB limit" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let records: any[];
    try {
      const csvText = await file.text();
      records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relaxColumnCount: true,
      });
    } catch {
      return NextResponse.json({ error: "CSV parsing failed" }, { status: 400 });
    }

    if (records.length === 0) {
      return NextResponse.json({ error: "CSV file contains no data rows" }, { status: 400 });
    }

    if (records.length > 10000) {
      return NextResponse.json({ error: "CSV file contains too many rows (max 10,000)" }, { status: 400 });
    }

    const { validRows, errors } = validateProductBatch(records);

    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        processed: 0,
        failed: errors.length,
        errors,
        failedRows: records.filter((_, i) => errors.some((e) => e.row === i + 1)),
      });
    }

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
        startedAt: new Date(),
      },
    });

    const chunkSize = 100;
    const chunks = [];
    for (let i = 0; i < validRows.length; i += chunkSize) {
      chunks.push(validRows.slice(i, i + chunkSize));
    }
    
    let processedCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const failedRows: any[] = [];
    const processingErrors: string[] = [];
    const startTime = Date.now();

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      try {
        await prismadb.$transaction(
          async (tx) => {
            for (const row of chunk) {
              try {
                const categoryExists = await tx.category.findFirst({
                  where: { id: row.categoryId },
                });

                if (!categoryExists) {
                  throw new Error(`Category with ID ${row.categoryId} does not exist`);
                }

                const product = await tx.product.upsert({
                  where: {
                    storeId_name: {
                      storeId,
                      name: row.name,
                    },
                  },
                  update: {
                    description: row.description,
                    price: new Decimal(row.price),
                    categoryId: row.categoryId,
                    downloadUrl: row.downloadUrl || null,
                    isFeatured: row.isFeatured,
                    isArchived: row.isArchived,
                    keywords: row.keywords,
                    updatedAt: new Date(),
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
                    keywords: row.keywords,
                  },
                });

                // ✅ Create associated image if present
                if (row.imageUrl) {
                  await tx.image.create({
                    data: {
                      productId: product.id,
                      url: row.imageUrl,
                    },
                  });
                }

                processedCount++;
              } catch (rowError) {
                console.error(`Failed to process row: ${row.name}`, rowError);
                failedRows.push(row);
                processingErrors.push(`Row ${processedCount + failedRows.length}: Error`);
              }
            }
          },
          { timeout: 30000 }
        );
      } catch (chunkError) {
        console.error(`Failed to process chunk ${chunkIndex}:`, chunkError);
        chunk.forEach((row) => {
          failedRows.push(row);
          processingErrors.push(`Chunk ${chunkIndex} failed`);
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
        errorMessage: processingErrors.length > 0 ? processingErrors.join("; ") : null,
        processingTimeMs: processingTime,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: failedRows.length === 0,
      processed: processedCount,
      failed: failedRows.length,
      errors: processingErrors.map((error, index) => ({
        row: index + 1,
        field: "processing",
        message: error,
      })),
      failedRows,
      importLogId,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Internal server error. Please try again later." },
      { status: 500 }
    );
  }
}