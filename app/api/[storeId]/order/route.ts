import { NextRequest, NextResponse } from "next/server"
import prismadb from "@/lib/prismadb"
import { withCors } from "@/lib/core"

export const GET = withCors(async (req: NextRequest) => {
  const userId = req.headers.get("x-user-id")
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const orders = await prismadb.order.findMany({
    where: { userId },
    include: {
      orderItems: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              storeId: true, 
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  })


  const normalizedOrders = orders.map((order) => ({
    ...order,
    orderItems: order.orderItems.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product?.name ?? "Unknown Product",
      storeId: item.product?.storeId ?? "", 
      price: item.price,
    })),
  }))

  return NextResponse.json(normalizedOrders)
})
