import { OrderClient } from "./_components/client"
import prismadb from "@/lib/prismadb"
import type { OrderColumn } from "./_components/columns"
import { formatter } from "@/lib/utils"
import { CheckCircle2, ClipboardListIcon, ShoppingCartIcon, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

interface PageProps {
  params: Promise<{
    storeId: string
  }>
}

const OrdersPage = async ({ params }: PageProps) => {
  const { storeId } = await params

  const orders = await prismadb.order.findMany({
    where: { storeId },
    include: {
      OrderItem: {
        include: {
          products: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  const formattedOrders: OrderColumn[] = orders.map((item) => {
    return {
      id: item.id,
      phone: item.phone || "-",
      address: item.address ?? "-",
      email: item.email || "-",
      isPaid: item.isPaid,
      products: item.OrderItem.map((orderItem) => orderItem.products.name).join(", "),
      totalPrice: item.price ? formatter.format(item.price.toNumber()) : "N/A",
      createdAt: item.createdAt.toISOString(),
    }
  })

  // Calculate order statistics
  const totalOrders = formattedOrders.length
  const paidOrders = formattedOrders.filter((order) => order.isPaid).length
  const unpaidOrders = totalOrders - paidOrders

  // Calculate total revenue from paid orders (safe handling for price)
  const totalRevenue = orders
    .filter((order) => order.isPaid && order.price !== null)
    .reduce((total, order) => total + (order.price?.toNumber() || 0), 0)

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {totalOrders > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 md:p-8 pb-0 md:pb-0">
          <div className="bg-card rounded-lg border p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Orders</p>
              <p className="text-2xl font-bold">{totalOrders}</p>
            </div>
            <div className="rounded-full bg-primary/10 p-2">
              <ShoppingCartIcon className="h-5 w-5 text-primary" />
            </div>
          </div>

          <div className="bg-card rounded-lg border p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Paid Orders</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold">{paidOrders}</p>
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                  {Math.round((paidOrders / totalOrders) * 100)}%
                </Badge>
              </div>
            </div>
            <div className="rounded-full bg-green-500/10 p-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          </div>

          <div className="bg-card rounded-lg border p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold">{formatter.format(totalRevenue)}</p>
            </div>
            <div className="rounded-full bg-primary/10 p-2">
              <ClipboardListIcon className="h-5 w-5 text-primary" />
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 p-4 md:p-8">
        <div className="rounded-lg border bg-card shadow-sm transition-all">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between p-4 md:p-6">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <ClipboardListIcon className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-medium">Order List</h2>
            </div>

            {totalOrders > 0 && (
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> {paidOrders} Paid
                </Badge>
                {unpaidOrders > 0 && (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                    <XCircle className="h-3 w-3 mr-1" /> {unpaidOrders} Unpaid
                  </Badge>
                )}
              </div>
            )}
          </div>

          <Separator />

          {formattedOrders.length > 0 ? (
            <div className="p-4">
              <OrderClient data={formattedOrders} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="rounded-full bg-primary/10 p-3 mb-4">
                <ShoppingCartIcon className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">No orders found</h3>
              <p className="text-muted-foreground max-w-sm mb-6">
                Your store hasn&apos;t received any orders yet. Orders will appear here once customers make purchases.
              </p>
              <Button variant="outline">View Store Settings</Button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default OrdersPage
