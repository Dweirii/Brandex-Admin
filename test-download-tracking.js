const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BRANDEX_STORE_ID = "a940170f-71ea-4c2b-b0ec-e2e9e3c68567";

async function testDownloadTracking() {
  console.log('🧪 Testing Download Tracking System\n');
  console.log('=' .repeat(60));

  try {
    // 1. Check total downloads in database
    console.log('\n📊 1. Total Downloads in Database:');
    const totalDownloads = await prisma.download.count({
      where: { storeId: BRANDEX_STORE_ID }
    });
    console.log(`   Total: ${totalDownloads} downloads\n`);

    // 2. Show latest 10 downloads
    console.log('📥 2. Latest 10 Downloads:');
    const latestDownloads = await prisma.download.findMany({
      where: { storeId: BRANDEX_STORE_ID },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        product: {
          select: { name: true, price: true }
        }
      }
    });

    if (latestDownloads.length === 0) {
      console.log('   ⚠️  No downloads found yet\n');
    } else {
      latestDownloads.forEach((d, i) => {
        const price = d.product.price.toNumber();
        const type = d.isFree ? '🆓 FREE' : '💰 PAID';
        const date = new Date(d.createdAt).toLocaleString();
        console.log(`   ${i + 1}. ${d.product.name}`);
        console.log(`      ${type} | ${date}`);
      });
      console.log('');
    }

    // 3. Today's downloads
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const todayDownloads = await prisma.download.findMany({
      where: {
        storeId: BRANDEX_STORE_ID,
        createdAt: { gte: todayStart, lte: todayEnd }
      }
    });

    const todayFree = todayDownloads.filter(d => d.isFree).length;
    const todayPaid = todayDownloads.filter(d => !d.isFree).length;

    console.log('📅 3. Today\'s Downloads:');
    console.log(`   Free: ${todayFree}`);
    console.log(`   Paid: ${todayPaid}`);
    console.log(`   Total: ${todayDownloads.length}`);
    console.log(`   Time Range: ${todayStart.toISOString()} to ${todayEnd.toISOString()}\n`);

    // 4. Yesterday's downloads (what daily report shows)
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const yesterdayDownloads = await prisma.download.findMany({
      where: {
        storeId: BRANDEX_STORE_ID,
        createdAt: { gte: yesterday, lte: yesterdayEnd }
      }
    });

    const yesterdayFree = yesterdayDownloads.filter(d => d.isFree).length;
    const yesterdayPaid = yesterdayDownloads.filter(d => !d.isFree).length;

    console.log('📅 4. Yesterday\'s Downloads (Daily Report Data):');
    console.log(`   Free: ${yesterdayFree}`);
    console.log(`   Paid: ${yesterdayPaid}`);
    console.log(`   Total: ${yesterdayDownloads.length}`);
    console.log(`   Time Range: ${yesterday.toISOString()} to ${yesterdayEnd.toISOString()}\n`);

    // 5. Last 7 days (Weekly Report)
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const weekDownloads = await prisma.download.findMany({
      where: {
        storeId: BRANDEX_STORE_ID,
        createdAt: { gte: weekAgo, lte: now }
      }
    });

    const weekFree = weekDownloads.filter(d => d.isFree).length;
    const weekPaid = weekDownloads.filter(d => !d.isFree).length;

    console.log('📅 5. Last 7 Days (Weekly Report Data):');
    console.log(`   Free: ${weekFree}`);
    console.log(`   Paid: ${weekPaid}`);
    console.log(`   Total: ${weekDownloads.length}\n`);

    // 6. Test API endpoint
    console.log('🌐 6. Test API Endpoint:');
    console.log('   Run this command to test the daily report:');
    console.log('   curl "http://localhost:3001/api/test-report?period=daily"\n');

    // 7. Summary
    console.log('=' .repeat(60));
    console.log('✅ Test Summary:');
    console.log(`   • Total Downloads: ${totalDownloads}`);
    console.log(`   • Today: ${todayDownloads.length} downloads`);
    console.log(`   • Yesterday: ${yesterdayDownloads.length} downloads (for daily report)`);
    console.log(`   • Last 7 Days: ${weekDownloads.length} downloads\n`);

    if (totalDownloads === 0) {
      console.log('⚠️  No downloads found. Try downloading a product from the store.');
      console.log('   Make sure the Store is pointing to localhost:3001 for downloads.\n');
    } else {
      console.log('✅ Download tracking is working correctly!\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testDownloadTracking();

