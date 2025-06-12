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
      orderItems: { include: { product: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(orders)
})

// handle preflight OPTIONS
export function OPTIONS() {
  const res = new NextResponse(null, { status: 204 })
  res.headers.set("Access-Control-Allow-Origin", "*")
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, x-user-id")
  return res
}
