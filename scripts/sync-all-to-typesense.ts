
import "dotenv/config";
import prismadb from "../lib/prismadb";
import { typesenseAdmin, PRODUCT_COLLECTION_NAME, productSchema, toTypesenseDocument } from "../lib/typesense";

async function main() {
    console.log("🚀 Starting Typesense Full Sync...");

    // 1. Delete existing collection to ensure clean slate (and apply new schema if changed)
    try {
        console.log(`Deleting existing collection: ${PRODUCT_COLLECTION_NAME}...`);
        await typesenseAdmin.collections(PRODUCT_COLLECTION_NAME).delete();
        console.log("✅ Collection deleted.");
    } catch (error: any) {
        if (error.httpStatus === 404) {
            console.log("Collection did not exist, skipping delete.");
        } else {
            console.error("Error deleting collection:", error);
            process.exit(1);
        }
    }

    // 2. Create collection with schema
    try {
        console.log("Creating collection with schema...");
        await typesenseAdmin.collections().create(productSchema);
        console.log("✅ Collection created.");
    } catch (error) {
        console.error("Error creating collection:", error);
        process.exit(1);
    }

    // 3. Fetch all products from DB
    console.log("Fetching all products from database...");
    const products = await prismadb.products.findMany({
        where: { isArchived: false }, // Only sync active products? User said "update", usually implies active. 
        // Actually better to sync all and use 'isArchived' facet to filter.
        // Let's sync ALL so admin can potential search archived ones too if we change filter later.
        // Wait, let's keep it simple. Sync all.
        include: {
            Category: true,
        },
    });

    console.log(`Found ${products.length} products to sync.`);

    // 4. Batch import to Typesense
    if (products.length > 0) {
        const documents = products.map(toTypesenseDocument);
        const batchSize = 100;

        for (let i = 0; i < documents.length; i += batchSize) {
            const batch = documents.slice(i, i + batchSize);
            console.log(`Importing batch ${i} to ${i + batch.length}...`);

            try {
                const results = await typesenseAdmin
                    .collections(PRODUCT_COLLECTION_NAME)
                    .documents()
                    .import(batch, { action: "upsert" });

                const failedItems = results.filter((r: any) => !r.success);
                if (failedItems.length > 0) {
                    console.error("Failed items in batch:", JSON.stringify(failedItems, null, 2));
                }
            } catch (error) {
                console.error(`Error importing batch ${i}:`, error);
            }
        }
    }

    console.log("🎉 Sync completed successfully!");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prismadb.$disconnect();
    });
