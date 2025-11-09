import prismadb from "@/lib/prismadb";

export const getBestPerformingProduct = async (storeId: string) => {
  // Get top product by downloads
  const topProductByDownloads = await prismadb.product.findFirst({
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
      orderItems: {
        some: {
          productId: topProductByDownloads.id,
        },
      },
    },
    include: {
      orderItems: {
        where: {
          productId: topProductByDownloads.id,
        },
        include: {
          product: true,
        },
      },
    },
  });

  const productRevenue = ordersWithProduct.reduce((total, order) => {
    const orderTotal = order.orderItems.reduce((sum, item) => {
      return sum + item.product.price.toNumber();
    }, 0);
    return total + orderTotal;
  }, 0);

  return {
    name: topProductByDownloads.name,
    downloadsCount: topProductByDownloads.downloadsCount || 0,
    revenue: productRevenue,
  };
};

