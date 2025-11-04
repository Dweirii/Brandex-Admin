import { ProductClient } from "./_components/client"
import prismadb from "@/lib/prismadb"
import { format } from "date-fns"
import type { ProductColumn } from "./_components/columns"
import { formatter } from "@/lib/utils"

type RouteParams = Promise<{ storeId: string }>

export default async function ProductsPage({ params }: { params: RouteParams }) {
  const { storeId } = await params

  const products = await prismadb.product.findMany({
    where: { storeId },
    include: {
      category: { select: { id: true, name: true } },
      Image: { select: { url: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  })

  // Only fetch the fields you’ll actually pass to a Client Component.
  const categoriesRaw = await prismadb.category.findMany({
    where: { storeId },
    select: { id: true, name: true }, // ← avoid Date fields crossing the boundary
    orderBy: { name: "asc" },
  })

  const formattedProducts: ProductColumn[] = products.map((item) => ({
    id: item.id,
    name: item.name,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    imageUrl: (item as any).Image?.[0]?.url ?? null,
    isFeatured: item.isFeatured ? "Yes" : "No",
    isArchived: item.isArchived ? "Yes" : "No",
    price: formatter.format(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (item as any).price?.toNumber === "function"
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (item as any).price.toNumber()
        : Number(item.price)
    ),
    category: item.category?.name ?? "—",
    categoryId: item.category?.id ?? item.categoryId, // safe fallback
    createdAt: format(item.createdAt, "MMMM do, yyyy"),
  }))

  // categories are now plain objects (id, name)
  return <ProductClient data={formattedProducts} categories={categoriesRaw} storeId={storeId} />
}
