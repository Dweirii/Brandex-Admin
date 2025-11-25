import { CategoyClient } from "./_components/client"
import prismadb from "@/lib/prismadb"
import { format } from "date-fns"
import type { CategoryColumn } from "./_components/columns"

const CategoriesPage = async ({ params }: { params: Promise<{ storeId: string }> }) => {
  const { storeId } = await params

  const categories = await prismadb.category.findMany({
    where: { storeId },
    include: { Billboard: true },
    orderBy: { createdAt: "desc" },
  })

  const formattedCategories: CategoryColumn[] = categories.map((item) => ({
    id: item.id,
    name: item.name,
    billboardLabel: item.Billboard.label,
    createdAt: format(item.createdAt, "MMMM do, yyyy"),
  }))

  return <CategoyClient data={formattedCategories} storeId={storeId} />
}

export default CategoriesPage

