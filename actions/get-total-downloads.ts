import prismadb from "@/lib/prismadb";

export const getTotalDownloads = async (storeId: string) => {
  const { _sum } = await prismadb.products.aggregate({
    where: {
      storeId,
    },
    _sum: {
      downloadsCount: true,
    },
  });

  const totalDownloads = _sum.downloadsCount || 0;
  return totalDownloads;
};
