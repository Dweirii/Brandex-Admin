import { PrismaClient } from '@prisma/client';
import { typesenseAdmin, productSchema, PRODUCT_COLLECTION_NAME, toTypesenseDocument } from '../lib/typesense';

const prisma = new PrismaClient();

async function syncProductsToTypesense() {
  console.log('🚀 Starting Typesense sync for 50K+ products...');
  const startTime = Date.now();

  try {
    // 1. Delete and recreate collection
    try {
      await typesenseAdmin.collections(PRODUCT_COLLECTION_NAME).delete();
      console.log('🗑️  Deleted existing collection');
    } catch (e) {
      console.log('ℹ️  No existing collection to delete');
    }

    await typesenseAdmin.collections().create(productSchema);
    console.log('✅ Created new collection with schema');

    // 2. Get total count
    const totalProducts = await prisma.products.count();
    console.log(`📊 Found ${totalProducts} products to sync`);

    // 3. Sync in batches
    const BATCH_SIZE = 1000; // Larger batches for faster sync
    let skip = 0;
    let totalSynced = 0;
    let batchNumber = 0;

    while (skip < totalProducts) {
      batchNumber++;
      const batchStart = Date.now();

      const products = await prisma.products.findMany({
        skip,
        take: BATCH_SIZE,
        include: {
          Category: true,
        },
      });

      if (products.length === 0) break;

      // Convert to Typesense documents
      const documents = products.map(toTypesenseDocument);

      // Batch import
      const importResults = await typesenseAdmin
        .collections(PRODUCT_COLLECTION_NAME)
        .documents()
        .import(documents, { action: 'create' });

      // Check for errors
      const errors = importResults.filter((result: any) => !result.success);
      if (errors.length > 0) {
        console.error(`⚠️  Batch ${batchNumber}: ${errors.length} errors`);
        errors.slice(0, 3).forEach((err: any) => console.error(err));
      }

      totalSynced += products.length;
      const batchTime = Date.now() - batchStart;
      const progress = ((totalSynced / totalProducts) * 100).toFixed(1);
      const rate = Math.round(products.length / (batchTime / 1000));
      
      console.log(
        `📦 Batch ${batchNumber}: ${totalSynced}/${totalProducts} (${progress}%) - ${rate} products/sec`
      );

      skip += BATCH_SIZE;
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const avgRate = Math.round(totalSynced / parseFloat(totalTime));
    
    console.log(`\n✅ Sync complete!`);
    console.log(`   Total: ${totalSynced} products`);
    console.log(`   Time: ${totalTime}s`);
    console.log(`   Rate: ${avgRate} products/sec`);

    // 4. Verify collection
    const collection = await typesenseAdmin.collections(PRODUCT_COLLECTION_NAME).retrieve();
    console.log(`\n📊 Collection stats:`);
    console.log(`   Documents: ${collection.num_documents}`);
    if ('num_memory_bytes' in collection && typeof collection.num_memory_bytes === 'number') {
      console.log(`   Memory used: ${(collection.num_memory_bytes / 1024 / 1024).toFixed(2)} MB`);
    }

  } catch (error) {
    console.error('❌ Sync failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

syncProductsToTypesense();


