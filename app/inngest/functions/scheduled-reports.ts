import { inngest } from "@/app/inngest/inngest";
import { sendSummaryReportToAdmin } from "@/lib/email";
import { getTotalRevenue } from "@/actions/get-total-revenue";
import { getSalesCount } from "@/actions/get-sales-count";
import { getTotalDownloads } from "@/actions/get-total-downloads";
import { getStockCount } from "@/actions/get-stock-count";
import { getTopDownloadedProducts } from "@/actions/get-topDownloads";
import { getGraphRevenue } from "@/actions/get-graph-revenue";
import { getDownloadsAnalytics } from "@/actions/get-download-analytics";
import { getDownloadsAnalyticsForPeriod } from "@/actions/get-downloads-analytics-for-period";
import { getBestPerformingProduct } from "@/actions/get-best-performing-product";
import { getRevenueForPeriod } from "@/actions/get-revenue-for-period";
import { getOrdersForPeriod } from "@/actions/get-orders-for-period";
import prismadb from "@/lib/prismadb";

// Daily report function - runs every day at 9 AM
export const sendDailyReport = inngest.createFunction(
  { id: "send-daily-report", name: "Send Daily Business Report" },
  { cron: "0 9 * * *" }, // Every day at 9 AM
  async ({ step }) => {
    return await step.run("generate-daily-report", async () => {
      // Only send reports for Brandex store (specific store ID)
      const BRANDEX_STORE_ID = "a940170f-71ea-4c2b-b0ec-e2e9e3c68567";
      const store = await prismadb.store.findUnique({
        where: { id: BRANDEX_STORE_ID },
      });

      if (!store) {
        console.log("⚠️ Brandex store not found");
        return;
      }

      // Daily report: yesterday (previous full day)
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 1); // Yesterday
      endDate.setHours(23, 59, 59, 999);
      const startDate = new Date(endDate);
      startDate.setHours(0, 0, 0, 0);

      // Get current period data
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

      // Get previous period data for revenue growth calculation (day before yesterday)
      const previousEndDate = new Date(startDate);
      previousEndDate.setMilliseconds(previousEndDate.getMilliseconds() - 1); // End of day before yesterday
      const previousStartDate = new Date(previousEndDate);
      previousStartDate.setHours(0, 0, 0, 0);

      const previousRevenue = await getRevenueForPeriod(
        store.id,
        previousStartDate,
        previousEndDate
      );

      // Calculate revenue growth (downloads growth requires historical tracking)
      const revenueGrowth =
        previousRevenue > 0
          ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
          : undefined;

      // Calculate conversion rate
      const conversionRate =
        downloadsAnalytics.totalDownloads > 0
          ? (downloadsAnalytics.paidDownloads / downloadsAnalytics.totalDownloads) * 100
          : 0;

      await sendSummaryReportToAdmin({
        storeId: store.id,
        storeName: store.name,
        period: "daily",
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
        revenueGrowth,
        bestPerformingProduct: bestProduct || undefined,
        conversionRate,
      });
    });
  }
);

// Weekly report function - runs every Monday at 9 AM
export const sendWeeklyReport = inngest.createFunction(
  { id: "send-weekly-report", name: "Send Weekly Business Report" },
  { cron: "0 9 * * 1" }, // Every Monday at 9 AM
  async ({ step }) => {
    return await step.run("generate-weekly-report", async () => {
      // Only send reports for Brandex store (specific store ID)
      const BRANDEX_STORE_ID = "a940170f-71ea-4c2b-b0ec-e2e9e3c68567";
      const store = await prismadb.store.findUnique({
        where: { id: BRANDEX_STORE_ID },
      });

      if (!store) {
        console.log("⚠️ Brandex store not found");
        return;
      }

      // Weekly report: previous week (Monday to Sunday)
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const daysToLastSunday = dayOfWeek === 0 ? 7 : dayOfWeek; // Days to go back to last Sunday
      
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() - daysToLastSunday); // Last Sunday
      endDate.setHours(23, 59, 59, 999);
      
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 6); // Previous Monday (7 days before Sunday)
      startDate.setHours(0, 0, 0, 0);

      // Get current period data
      const [
        currentRevenue,
        currentOrders,
        downloadsAnalytics,
        stockCount,
        topProducts,
        revenueByMonth,
        bestProduct,
      ] = await Promise.all([
        getRevenueForPeriod(store.id, startDate, endDate),
        getOrdersForPeriod(store.id, startDate, endDate),
        getDownloadsAnalyticsForPeriod(store.id, startDate, endDate),
        getStockCount(store.id),
        getTopDownloadedProducts(store.id),
        getGraphRevenue(store.id),
        getBestPerformingProduct(store.id),
      ]);

      // Get previous period data for revenue growth calculation (previous week)
      const previousEndDate = new Date(startDate);
      previousEndDate.setMilliseconds(previousEndDate.getMilliseconds() - 1); // End of previous Sunday
      const previousStartDate = new Date(previousEndDate);
      previousStartDate.setDate(previousStartDate.getDate() - 6); // Previous Monday
      previousStartDate.setHours(0, 0, 0, 0);

      const previousRevenue = await getRevenueForPeriod(
        store.id,
        previousStartDate,
        previousEndDate
      );

      // Calculate revenue growth (downloads growth requires historical tracking)
      const revenueGrowth =
        previousRevenue > 0
          ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
          : undefined;

      // Calculate conversion rate
      const conversionRate =
        downloadsAnalytics.totalDownloads > 0
          ? (downloadsAnalytics.paidDownloads / downloadsAnalytics.totalDownloads) * 100
          : 0;

      await sendSummaryReportToAdmin({
        storeId: store.id,
        storeName: store.name,
        period: "weekly",
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
        revenueByMonth,
        revenueGrowth,
        bestPerformingProduct: bestProduct || undefined,
        conversionRate,
      });
    });
  }
);

// Monthly report function - runs on the 1st of every month at 9 AM
export const sendMonthlyReport = inngest.createFunction(
  { id: "send-monthly-report", name: "Send Monthly Business Report" },
  { cron: "0 9 1 * *" }, // First day of every month at 9 AM
  async ({ step }) => {
    return await step.run("generate-monthly-report", async () => {
      // Only send reports for Brandex store (specific store ID)
      const BRANDEX_STORE_ID = "a940170f-71ea-4c2b-b0ec-e2e9e3c68567";
      const store = await prismadb.store.findUnique({
        where: { id: BRANDEX_STORE_ID },
      });

      if (!store) {
        console.log("⚠️ Brandex store not found");
        return;
      }

      // Monthly report: previous full month
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1); // First day of previous month
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of previous month
      endDate.setHours(23, 59, 59, 999);

      // Get current period data
      const [
        currentRevenue,
        currentOrders,
        downloadsAnalytics,
        stockCount,
        topProducts,
        revenueByMonth,
        bestProduct,
      ] = await Promise.all([
        getRevenueForPeriod(store.id, startDate, endDate),
        getOrdersForPeriod(store.id, startDate, endDate),
        getDownloadsAnalyticsForPeriod(store.id, startDate, endDate),
        getStockCount(store.id),
        getTopDownloadedProducts(store.id),
        getGraphRevenue(store.id),
        getBestPerformingProduct(store.id),
      ]);

      // Get previous period data for revenue growth calculation (month before previous month)
      const previousEndDate = new Date(startDate);
      previousEndDate.setMilliseconds(previousEndDate.getMilliseconds() - 1); // End of month before previous month
      const previousStartDate = new Date(previousEndDate.getFullYear(), previousEndDate.getMonth(), 1);
      previousStartDate.setHours(0, 0, 0, 0);

      const previousRevenue = await getRevenueForPeriod(
        store.id,
        previousStartDate,
        previousEndDate
      );

      // Calculate revenue growth (downloads growth requires historical tracking)
      const revenueGrowth =
        previousRevenue > 0
          ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
          : undefined;

      // Calculate conversion rate
      const conversionRate =
        downloadsAnalytics.totalDownloads > 0
          ? (downloadsAnalytics.paidDownloads / downloadsAnalytics.totalDownloads) * 100
          : 0;

      await sendSummaryReportToAdmin({
        storeId: store.id,
        storeName: store.name,
        period: "monthly",
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
        revenueByMonth,
        revenueGrowth,
        bestPerformingProduct: bestProduct || undefined,
        conversionRate,
      });
    });
  }
);

