import { NextResponse } from "next/server";
import { sendSummaryReportToAdmin } from "@/lib/email";
import { getStockCount } from "@/actions/get-stock-count";
import { getTopDownloadedProducts } from "@/actions/get-topDownloads";
import { getDownloadsAnalyticsForPeriod } from "@/actions/get-downloads-analytics-for-period";
import { getBestPerformingProduct } from "@/actions/get-best-performing-product";
import { getRevenueForPeriod } from "@/actions/get-revenue-for-period";
import { getOrdersForPeriod } from "@/actions/get-orders-for-period";
import prismadb from "@/lib/prismadb";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "daily"; // daily, weekly, or monthly
    const storeId = searchParams.get("storeId"); // Optional: specific store

    console.log("📊 Testing email report...");
    console.log("Period:", period);
    console.log("Store ID:", storeId || "All stores");

    // Only send reports for Brandex store (specific store ID)
    const BRANDEX_STORE_ID = "a940170f-71ea-4c2b-b0ec-e2e9e3c68567";
    const stores = storeId
      ? await prismadb.store.findMany({ where: { id: storeId } })
      : await prismadb.store.findMany({ where: { id: BRANDEX_STORE_ID } });

    if (stores.length === 0) {
      return NextResponse.json(
        { success: false, message: "No stores found" },
        { status: 404 }
      );
    }

    const results = [];

    for (const store of stores) {
      const endDate = new Date();
      const startDate = new Date();

      // Set date range based on period
      if (period === "daily") {
        // Daily report: yesterday (previous full day)
        endDate.setDate(endDate.getDate() - 1); // Yesterday
        endDate.setHours(23, 59, 59, 999);
        startDate.setTime(endDate.getTime());
        startDate.setHours(0, 0, 0, 0);
      } else if (period === "weekly") {
        // Weekly report: previous week (Monday to Sunday)
        const dayOfWeek = endDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysToLastSunday = dayOfWeek === 0 ? 7 : dayOfWeek; // Days to go back to last Sunday
        
        endDate.setDate(endDate.getDate() - daysToLastSunday); // Last Sunday
        endDate.setHours(23, 59, 59, 999);
        
        startDate.setTime(endDate.getTime());
        startDate.setDate(startDate.getDate() - 6); // Previous Monday (7 days before Sunday)
        startDate.setHours(0, 0, 0, 0);
      } else if (period === "monthly") {
        // Monthly report: previous full month
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setDate(1); // First day of previous month
        startDate.setHours(0, 0, 0, 0);
        
        endDate.setMonth(endDate.getMonth()); // Current month
        endDate.setDate(0); // Last day of previous month
        endDate.setHours(23, 59, 59, 999);
      }

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

      // Get previous period data for revenue growth calculation
      if (period === "daily") {
        // Day before yesterday
        const previousEndDate = new Date(startDate);
        previousEndDate.setMilliseconds(previousEndDate.getMilliseconds() - 1); // End of day before yesterday
        const previousStartDate = new Date(previousEndDate);
        previousStartDate.setHours(0, 0, 0, 0);
        
        const previousRevenue = await getRevenueForPeriod(
          store.id,
          previousStartDate,
          previousEndDate
        );
        
        const revenueGrowth =
          previousRevenue > 0
            ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
            : undefined;
        
        // Calculate conversion rate
        const conversionRate =
          downloadsAnalytics.totalDownloads > 0
            ? (downloadsAnalytics.paidDownloads / downloadsAnalytics.totalDownloads) * 100
            : 0;
        
        // Continue with report data...
        const reportData = {
          storeId: store.id,
          storeName: store.name,
          period: period as "daily" | "weekly" | "monthly",
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

        results.push({
          storeId: store.id,
          storeName: store.name,
          emailSent,
          period,
          metrics: {
            totalRevenue: currentRevenue,
            paidOrders: currentOrders,
            freeDownloads: downloadsAnalytics.freeDownloads,
            paidDownloads: downloadsAnalytics.paidDownloads,
            totalDownloads: downloadsAnalytics.totalDownloads,
            conversionRate: conversionRate.toFixed(2) + "%",
            revenueGrowth: revenueGrowth !== undefined ? revenueGrowth.toFixed(2) + "%" : "N/A",
          },
        });
        continue;
      } else if (period === "weekly") {
        // Previous week (Monday to Sunday)
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
        
        const revenueGrowth =
          previousRevenue > 0
            ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
            : undefined;
        
        // Calculate conversion rate
        const conversionRate =
          downloadsAnalytics.totalDownloads > 0
            ? (downloadsAnalytics.paidDownloads / downloadsAnalytics.totalDownloads) * 100
            : 0;
        
        // Continue with report data...
        const reportData = {
          storeId: store.id,
          storeName: store.name,
          period: period as "daily" | "weekly" | "monthly",
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

        results.push({
          storeId: store.id,
          storeName: store.name,
          emailSent,
          period,
          metrics: {
            totalRevenue: currentRevenue,
            paidOrders: currentOrders,
            freeDownloads: downloadsAnalytics.freeDownloads,
            paidDownloads: downloadsAnalytics.paidDownloads,
            totalDownloads: downloadsAnalytics.totalDownloads,
            conversionRate: conversionRate.toFixed(2) + "%",
            revenueGrowth: revenueGrowth !== undefined ? revenueGrowth.toFixed(2) + "%" : "N/A",
          },
        });
        continue;
      } else if (period === "monthly") {
        // Month before previous month
        const previousEndDate = new Date(startDate);
        previousEndDate.setMilliseconds(previousEndDate.getMilliseconds() - 1); // End of month before previous month
        const previousStartDate = new Date(previousEndDate.getFullYear(), previousEndDate.getMonth(), 1);
        previousStartDate.setHours(0, 0, 0, 0);
        
        const previousRevenue = await getRevenueForPeriod(
          store.id,
          previousStartDate,
          previousEndDate
        );
        
        const revenueGrowth =
          previousRevenue > 0
            ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
            : undefined;
        
        // Calculate conversion rate
        const conversionRate =
          downloadsAnalytics.totalDownloads > 0
            ? (downloadsAnalytics.paidDownloads / downloadsAnalytics.totalDownloads) * 100
            : 0;
        
        // Continue with report data...
        const reportData = {
          storeId: store.id,
          storeName: store.name,
          period: period as "daily" | "weekly" | "monthly",
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

        results.push({
          storeId: store.id,
          storeName: store.name,
          emailSent,
          period,
          metrics: {
            totalRevenue: currentRevenue,
            paidOrders: currentOrders,
            freeDownloads: downloadsAnalytics.freeDownloads,
            paidDownloads: downloadsAnalytics.paidDownloads,
            totalDownloads: downloadsAnalytics.totalDownloads,
            conversionRate: conversionRate.toFixed(2) + "%",
            revenueGrowth: revenueGrowth !== undefined ? revenueGrowth.toFixed(2) + "%" : "N/A",
          },
        });
        continue;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Test ${period} report sent successfully!`,
      results,
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

