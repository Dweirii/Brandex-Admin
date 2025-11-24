import prismadb from "@/lib/prismadb"

export const getDownloadsAnalytics = async (storeId: string) => {
    // Total downloads
    const { _sum: totalSum } = await prismadb.products.aggregate({
        where: { storeId },
        _sum: { downloadsCount: true },
    })

    // Totlal free downloads
    const {_sum: freeSum} = await prismadb.products.aggregate({
        where: {
            storeId,
            price: { equals: 0 },
        },
        _sum: { downloadsCount: true },
    })

    // Total paid downloads
    const { _sum: paidSum } = await prismadb.products.aggregate({
        where: {
            storeId,
            price: { gt: 0 },
        },
        _sum: { downloadsCount: true },
    })

    // Most downloaded product
    const topProduct = await prismadb.products.findFirst({
        where: { storeId },
        orderBy: {
            downloadsCount: "desc",
        },
        select: {
            id: true,
            name: true,
            downloadsCount: true,
            price: true,
            updatedAt: true,
        },
    })

    return {
        totalDownloads: totalSum.downloadsCount || 0,
        freeDownloads: freeSum.downloadsCount || 0,
        paidDownloads: paidSum.downloadsCount || 0,
        topProduct: topProduct || null,
    }
}