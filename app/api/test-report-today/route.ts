import { NextResponse } from "next/server";
import { sendSummaryReportToAdmin } from "@/lib/email";
import { getDownloadsAnalyticsForPeriod } from "@/actions/get-downloads-analytics-for-period";
import { getBestPerformingProduct } from "@/actions/get-best-performing-product";
import { getRevenueForPeriod } from "@/actions/get-revenue-for-period";
import { getOrdersForPeriod } from "@/actions/get-orders-for-period";
import { getStockCount } from "@/actions/get-stock-count";
import { getTopDownloadedProducts } from "@/actions/get-topDownloads";
import prismadb from "@/lib/prismadb";

export async function GET() {
  try {
    const BRANDEX_STORE_ID = "a940170f-71ea-4c2b-b0ec-e2e9e3c68567";

    const store = await prismadb.store.findUnique({
      where: { id: BRANDEX_STORE_ID },
    });

    if (!store) {
      return NextResponse.json({ success: false, message: "Store not found" }, { status: 404 });
    }

    // TODAY's date range (for testing)
    const now = new Date();
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    // Get TODAY's data
    const [
      currentRevenue,
      currentOrders,
      downloadsAnalytics,
      stockCount,
      topProducts,
      bestProduct,
    ] = await Promise.all([
      getRevenueForPeriod(store.id, startDate, endDate),
      getOrdersForPeriod(store.id, startDate, endDate),
      getDownloadsAnalyticsForPeriod(store.id, startDate, endDate),
      getStockCount(store.id),
      getTopDownloadedProducts(store.id),
      getBestPerformingProduct(store.id),
    ]);

    // Get previous day for growth calculation
    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - 1);
    const previousEndDate = new Date(startDate);
    previousEndDate.setMilliseconds(previousEndDate.getMilliseconds() - 1);

    const previousRevenue = await getRevenueForPeriod(
      store.id,
      previousStartDate,
      previousEndDate
    );

    const revenueGrowth =
      previousRevenue > 0
        ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
        : undefined;

    const conversionRate =
      downloadsAnalytics.totalDownloads > 0
        ? (downloadsAnalytics.paidDownloads / downloadsAnalytics.totalDownloads) * 100
        : 0;

    const reportData = {
      storeId: store.id,
      storeName: store.name,
      period: "daily" as const,
      startDate,
      endDate,
      freeDownloads: downloadsAnalytics.freeDownloads,
      paidDownloads: downloadsAnalytics.paidDownloads,
      paidOrders: currentOrders,
      totalRevenue: currentRevenue,
      totalDownloads: downloadsAnalytics.totalDownloads,
      stockCount,
      topProducts: topProducts.map((p) => ({
        name: p.name,
        downloadsCount: p.downloadsCount || 0,
        price: p.price.toNumber(),
      })),
      revenueByMonth: undefined,
      revenueGrowth,
      bestPerformingProduct: bestProduct || undefined,
      conversionRate,
    };

    const emailSent = await sendSummaryReportToAdmin(reportData);

    return NextResponse.json({
      success: true,
      message: `Test TODAY report sent successfully!`,
      emailSent,
      period: "today",
      metrics: {
        totalRevenue: currentRevenue,
        paidOrders: currentOrders,
        freeDownloads: downloadsAnalytics.freeDownloads,
        paidDownloads: downloadsAnalytics.paidDownloads,
        totalDownloads: downloadsAnalytics.totalDownloads,
        conversionRate: conversionRate.toFixed(2) + "%",
        revenueGrowth: revenueGrowth !== undefined ? revenueGrowth.toFixed(2) + "%" : "N/A",
      },
      adminEmail: process.env.ADMIN_EMAIL || "m.omari@ohg.world",
    });
  } catch (error) {
    console.error("❌ Error in test report endpoint:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error sending test report",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

