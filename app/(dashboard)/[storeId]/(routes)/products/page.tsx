import { ProductClient } from "./_components/client"
import prismadb from "@/lib/prismadb"
import { format } from "date-fns"
import type { ProductColumn } from "./_components/columns"
import { formatter } from "@/lib/utils"

const ProductsPage = async ({ params }: { params: Promise<{ storeId: string }> }) => {
  const { storeId } = await params

  const products = await prismadb.product.findMany({
    where: { storeId },
    include: {
      category: true,
    },
    orderBy: { createdAt: "desc" },
  })

  const categories = await prismadb.category.findMany({
    where: { storeId },
    orderBy: { name: "asc" },
  })

  const formattedProducts: ProductColumn[] = products.map((item) => ({
    id: item.id,
    name: item.name,
    isFeatured: item.isFeatured ? "Yes" : "No",
    isArchived: item.isArchived ? "Yes" : "No",
    price: formatter.format(item.price.toNumber()),
    category: item.category.name,
    categoryId: item.categoryId,
    createdAt: format(item.createdAt, "MMMM do, yyyy"),
  }))

  return <ProductClient data={formattedProducts} categories={categories} storeId={storeId}/>
}

export default ProductsPage

