import prismadb from "@/lib/prismadb";

export const getOrdersForPeriod = async (
  storeId: string,
  startDate: Date,
  endDate: Date
) => {
  const paidOrdersCount = await prismadb.order.count({
    where: {
      storeId,
      isPaid: true,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  return paidOrdersCount;
};

