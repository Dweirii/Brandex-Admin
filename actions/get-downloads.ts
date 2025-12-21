import prismadb from "@/lib/prismadb"

export interface DownloadRecord {
  id: string
  productId: string
  productName: string
  categoryId: string
  categoryName: string
  storeId: string
  userId: string | null
  email: string | null
  isFree: boolean
  createdAt: Date
  price: number
}

export const getDownloads = async (
  storeId: string,
  categoryId?: string
): Promise<DownloadRecord[]> => {
  const downloads = await prismadb.downloads.findMany({
    where: {
      storeId,
      ...(categoryId && {
        products: {
          categoryId,
        },
      }),
    },
    include: {
      products: {
        include: {
          Category: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  return downloads.map((download) => ({
    id: download.id,
    productId: download.productId,
    productName: download.products.name,
    categoryId: download.products.categoryId,
    categoryName: download.products.Category.name,
    storeId: download.storeId,
    userId: download.userId,
    email: download.email,
    isFree: download.isFree,
    createdAt: download.createdAt,
    price: download.products.price.toNumber(),
  }))
}














