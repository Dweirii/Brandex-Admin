
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import crypto from "crypto";

const prisma = new PrismaClient();

async function main() {
    const storeId = process.argv[2];

    if (!storeId) {
        console.log("❌ Please provide a Store ID.");

        try {
            const stores = await prisma.store.findMany();
            if (stores.length > 0) {
                console.log("\nFound the following stores:");
                stores.forEach(s => console.log(`ID: ${s.id}  | Name: ${s.name}`));
                console.log(`\nRun command: npx tsx scripts/direct-bulk-import.ts ${stores[0].id}`);
            } else {
                console.log("No stores found in the database.");
            }
        } catch (e) {
            console.error("Could not list stores. ensure DB is connected.");
        }
        return;
    }

    const csvFilePath = path.join(process.cwd(), "brandex_GOD_MODE_IMAGES_20251215_2130.csv");

    if (!fs.existsSync(csvFilePath)) {
        console.error(`❌ CSV file not found at: ${csvFilePath}`);
        return;
    }

    console.log(`📖 Reading CSV file...`);
    const fileContent = fs.readFileSync(csvFilePath, "utf-8");

    const { data, errors } = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
    });

    if (errors.length > 0) {
        console.warn("⚠️ CSV Parsing warnings:", errors);
    }

    const items = data as any[];
    console.log(`📊 Found ${items.length} products to import into Store ${storeId}`);

    // Pre-fetch existing names to ensure uniqueness
    console.log("🔍 Checking for name conflicts...");
    const existingProducts = await prisma.products.findMany({
        where: { storeId },
        select: { name: true }
    });
    const usedNames = new Set(existingProducts.map(p => p.name));
    console.log(`📝 Found ${usedNames.size} existing product names.`);

    // Deduplicate items in memory
    items.forEach((item) => {
        let name = item.name;
        let counter = 1;
        const originalName = name;
        while (usedNames.has(name)) {
            name = `${originalName} (${counter++})`;
        }
        usedNames.add(name);
        item.name = name; // Update the name to be unique
    });

    // Process in chunks
    const CHUNK_SIZE = 50;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);

        try {
            await prisma.$transaction(
                chunk.map((item) => {
                    // Basic validation/fallback
                    const price = parseFloat(item.price) || 0;
                    const isFeatured = item.isFeatured === "true" || item.isFeatured === true;
                    const isArchived = item.isArchived === "true" || item.isArchived === true;

                    // UUID generation happens in Prisma if we don't provide it, but for relations we might need IDs?
                    // The schema likely has @default(uuid()) for id.

                    const now = new Date();

                    return prisma.products.create({
                        data: {
                            id: crypto.randomUUID(),
                            storeId: storeId,
                            categoryId: item.categoryId,
                            name: item.name,
                            description: item.description || "",
                            price: price,
                            isFeatured: isFeatured,
                            isArchived: isArchived,
                            downloadUrl: item.downloadUrl || "",
                            keywords: item.keywords ? item.keywords.split(",").map((k: string) => k.trim()) : [],
                            updatedAt: now,
                            Image: item.imageUrl ? {
                                create: {
                                    id: crypto.randomUUID(),
                                    url: item.imageUrl,
                                    updatedAt: now
                                }
                            } : undefined
                        }
                    });
                })
            );
            successCount += chunk.length;
            process.stdout.write(`\r✅ Imported ${successCount}/${items.length} products...`);
        } catch (error) {
            console.error(`\n❌ Failed to import batch ${i} - ${i + CHUNK_SIZE}:`, error);
            failCount += chunk.length;
        }
    }

    console.log(`\n\n🎉 Import Finished!`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
