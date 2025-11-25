import prismadb from "@/lib/prismadb";

/**
 * Get download analytics for a specific time period
 * This uses the new Download table which tracks individual downloads with timestamps
 */
export const getDownloadsAnalyticsForPeriod = async (
  storeId: string,
  startDate: Date,
  endDate: Date
) => {
  // Total downloads in period
  const totalDownloads = await prismadb.downloads.count({
    where: {
      storeId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  // Free downloads in period
  const freeDownloads = await prismadb.downloads.count({
    where: {
      storeId,
      isFree: true,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  // Paid downloads in period
  const paidDownloads = await prismadb.downloads.count({
    where: {
      storeId,
      isFree: false,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  return {
    totalDownloads,
    freeDownloads,
    paidDownloads,
  };
};

