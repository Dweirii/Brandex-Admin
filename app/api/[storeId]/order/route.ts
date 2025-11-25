import { NextRequest, NextResponse } from "next/server"
import prismadb from "@/lib/prismadb"

// Dynamic CORS headers based on origin
const getCorsHeaders = (origin: string | null) => {
  const allowedOrigins = [
    "https://brandexme.com",
    "https://www.brandexme.com",
    "http://localhost:3000",
    "http://localhost:3001",
  ];
  
  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : "*";
  
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-user-id, Authorization",
    "Access-Control-Allow-Credentials": allowOrigin !== "*" ? "true" : "false",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
};

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  const userId = req.headers.get("x-user-id")
  if (!userId) {
    return new NextResponse("Unauthorized", { status: 401, headers: corsHeaders })
  }

  const orders = await prismadb.order.findMany({
    where: { userId },
    include: {
      OrderItem: { include: { products: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(orders, { headers: corsHeaders })
}

// handle preflight OPTIONS
export function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  const res = new NextResponse(null, { status: 204 })
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.headers.set(key, value)
  })
  return res
}
