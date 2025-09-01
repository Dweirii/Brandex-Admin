import { getGraphRevenue } from "@/actions/get-graph-revenue"
import { getSalesCount } from "@/actions/get-sales-count"
import { getStockCount } from "@/actions/get-stock-count"
import { getTotalDownloads } from "@/actions/get-total-downloads"
import { getTotalRevenue } from "@/actions/get-total-revenue"
import { Overview } from "@/components/overview"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Heading } from "@/components/ui/heading"
import { Separator } from "@/components/ui/separator"
import { formatter } from "@/lib/utils"
import { CreditCard, DollarSign, Download, Package } from "lucide-react"

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ storeId: string }>
}) {
  const { storeId } = await params

  const totalRevenue = await getTotalRevenue(storeId)
  const salesCount = await getSalesCount(storeId)
  const stockCount = await getStockCount(storeId)
  const graphRevenue = await getGraphRevenue(storeId)
  const totalDownloads = await getTotalDownloads(storeId)

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-6 p-6 pt-6 md:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Heading title="Dashboard" description="Overview of your store" />
          <div className="rounded-lg bg-muted px-3 py-1 text-xs font-medium">Store ID: {storeId}</div>
        </div>
        <Separator />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <div className="rounded-full bg-primary/10 p-2">
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatter.format(totalRevenue)}</div>
              <p className="text-xs text-muted-foreground mt-1">Lifetime revenue</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sales</CardTitle>
              <div className="rounded-full bg-green-500/10 p-2">
                <CreditCard className="h-4 w-4 text-green-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+{salesCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Total completed orders</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-800">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Downloads</CardTitle>
              <div className="rounded-full bg-amber-800/10 p-2">
                <Download className="h-4 w-4 text-amber-800" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">+{totalDownloads}</div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Products In Stock</CardTitle>
              <div className="rounded-full bg-blue-500/10 p-2">
                <Package className="h-4 w-4 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stockCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Available inventory</p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <Overview
            data={graphRevenue}
            title="Revenue Overview"
            description="Monthly revenue breakdown for your store"
          />
        </div>
      </div>
    </div>
  )
}

