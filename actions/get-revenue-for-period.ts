import prismadb from "@/lib/prismadb";

export const getRevenueForPeriod = async (
  storeId: string,
  startDate: Date,
  endDate: Date
) => {
  const paidOrders = await prismadb.order.findMany({
    where: {
      storeId,
      isPaid: true,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      OrderItem: {
        include: {
          products: true,
        },
      },
    },
  });

  const totalRevenue = paidOrders.reduce((total, order) => {
    const orderTotal = order.OrderItem.reduce((orderSum, item) => {
      return orderSum + (item.products?.price.toNumber() || 0);
    }, 0);
    return total + orderTotal;
  }, 0);

  return totalRevenue;
};

