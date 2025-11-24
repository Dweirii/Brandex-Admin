import prismadb from "@/lib/prismadb";

export const getDownloadsForPeriod = async (
  storeId: string,
  startDate: Date,
  endDate: Date
) => {
  // Get products that were updated (downloaded) in this period
  // Note: downloadsCount is cumulative, so we need to check product updates
  // For a more accurate approach, we'd track individual downloads, but for now
  // we'll use the total downloads count as an approximation
  
  const { _sum } = await prismadb.products.aggregate({
    where: {
      storeId,
      updatedAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    _sum: {
      downloadsCount: true,
    },
  });

  return _sum.downloadsCount || 0;
};

