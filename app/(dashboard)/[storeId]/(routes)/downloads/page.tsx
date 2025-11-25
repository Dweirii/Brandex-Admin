// app/(dashboard)/[storeId]/(routes)/downloads/page.tsx
import { notFound } from "next/navigation"
import { getDownloadsAnalytics } from "@/actions/get-download-analytics"
import { getTopDownloadedProducts } from "@/actions/get-topDownloads"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Download, Package, DollarSign, Star, TrendingUp } from "lucide-react"

export default async function DownloadsPage({
  params,
}: {
  params: Promise<{ storeId: string }>
}) {
  const { storeId } = await params
  if (!storeId) notFound()

  const analytics = await getDownloadsAnalytics(storeId)
  const topProducts = await getTopDownloadedProducts(storeId)

  const formatPrice = (price: string | number | { toNumber?: () => number }) => {
    let numPrice: number
    if (typeof price === "object" && typeof price?.toNumber === "function") {
      numPrice = price.toNumber()
    } else {
      numPrice = Number(price)
    }
    return numPrice === 0 ? "Free" : `$${numPrice.toFixed(2)}`
  }

  return (
    <div className="space-y-8 p-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-lg transition-shadow duration-200 border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Downloads</CardTitle>
            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-full">
              <Download className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {analytics.totalDownloads.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">All products combined</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-200 border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Free Downloads</CardTitle>
            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-full">
              <Package className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {analytics.freeDownloads.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">No cost products</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-200 border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid Downloads</CardTitle>
            <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-full">
              <DollarSign className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {analytics.paidDownloads.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Revenue generating</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow duration-200 border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Product</CardTitle>
            <div className="p-2 bg-amber-100 dark:bg-amber-900/20 rounded-full">
              <Star className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-bold text-foreground truncate" title={analytics.topProduct?.name}>
              {analytics.topProduct?.name ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {analytics.topProduct?.downloadsCount ?? 0} downloads
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top Products Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-foreground">Top Downloaded Products</h3>
          <div className="text-sm text-muted-foreground">Showing {topProducts.length} products</div>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-6 py-4 text-left font-semibold text-muted-foreground">#</th>
                  <th className="px-6 py-4 text-left font-semibold text-muted-foreground">Product Name</th>
                  <th className="px-6 py-4 text-center font-semibold text-muted-foreground">Downloads</th>
                  <th className="px-6 py-4 text-center font-semibold text-muted-foreground">Price</th>
                  <th className="px-6 py-4 text-center font-semibold text-muted-foreground">Type</th>
                  <th className="px-6 py-4 text-center font-semibold text-muted-foreground">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Package className="h-8 w-8 text-muted-foreground/50" />
                        <p className="text-muted-foreground">No downloads yet</p>
                        <p className="text-xs text-muted-foreground">
                          Products will appear here once downloaded
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  topProducts.map((product, index) => (
                    <tr key={product.id} className="border-b hover:bg-muted/30 transition-colors duration-150">
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                          {index + 1}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground truncate max-w-xs" title={product.name}>
                          {product.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Download className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold">
                            {product.downloadsCount.toLocaleString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium",
                            Number(product.price) === 0
                              ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                          )}
                        >
                          {formatPrice(product.price)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium",
                            Number(product.price) === 0
                              ? "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400"
                              : "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400"
                          )}
                        >
                          {Number(product.price) === 0 ? "Free" : "Paid"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-muted-foreground">
                        {new Date(product.updatedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

// tailwind cn helper if not already imported in this file
function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}
