import prismadb from "@/lib/prismadb"

export const getTopDownloadedProducts = async (storeId: string) => {
    const products = await prismadb.products.findMany({
        where: { storeId },
        orderBy: {
            downloadsCount: "desc",
        },
        take: 10,
        select: {
            id: true,
            name: true,
            downloadsCount: true,
            price: true,
            updatedAt: true,
        },
    })

    return products;
}