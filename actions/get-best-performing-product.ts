import prismadb from "@/lib/prismadb";

export const getBestPerformingProduct = async (storeId: string) => {
  // Get top product by downloads
  const topProductByDownloads = await prismadb.products.findFirst({
    where: { storeId },
    orderBy: {
      downloadsCount: "desc",
    },
    select: {
      id: true,
      name: true,
      downloadsCount: true,
      price: true,
    },
  });

  if (!topProductByDownloads) {
    return null;
  }

  // Calculate revenue for this product from orders
  const ordersWithProduct = await prismadb.order.findMany({
    where: {
      storeId,
      isPaid: true,
      OrderItem: {
        some: {
          productId: topProductByDownloads.id,
        },
      },
    },
    include: {
      OrderItem: {
        where: {
          productId: topProductByDownloads.id,
        },
        include: {
          products: true,
        },
      },
    },
  });

  const productRevenue = ordersWithProduct.reduce((total, order) => {
    const orderTotal = order.OrderItem.reduce((sum, item) => {
      return sum + (item.products?.price.toNumber() || 0);
    }, 0);
    return total + orderTotal;
  }, 0);

  return {
    name: topProductByDownloads.name,
    downloadsCount: topProductByDownloads.downloadsCount || 0,
    revenue: productRevenue,
  };
};

