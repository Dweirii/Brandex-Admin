import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_API_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": allowOrigin !== "*" ? "true" : "false",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
};

export async function GET(req: Request) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");
    const userAgent = req.headers.get("user-agent") || "";

    if (userAgent.toLowerCase().includes("bot") || userAgent.length < 10) {
      return new NextResponse("Blocked", { status: 403, headers: corsHeaders });
    }

    if (!sessionId || sessionId.length < 10) {
      return new NextResponse("Invalid session ID", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    const paymentIntent = session.payment_intent as Stripe.PaymentIntent;
    const orderId = session.metadata?.orderId || paymentIntent?.metadata?.orderId;

    if (!orderId) {
      return new NextResponse("Order ID not found in metadata", {
        status: 404,
        headers: corsHeaders,
      });
    }

    const order = await prismadb.order.findUnique({
      where: { id: orderId },
      include: {
        OrderItem: {
          include: {
            products: true,
          },
        },
      },
    });

    if (!order) {
      return new NextResponse("Order not found", {
        status: 404,
        headers: corsHeaders,
      });
    }

    if (order.sessionVerified) {
      return new NextResponse("Session already used", {
        status: 400,
        headers: corsHeaders,
      });
    }

    await prismadb.order.update({
      where: { id: orderId },
      data: { sessionVerified: true },
    });

    const orderItems = order.OrderItem.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.products.name,
      storeId: order.storeId,
    }));

    return NextResponse.json(
      {
        status: order.isPaid ? "paid" : "unpaid",
        orderItems,
      },
      { headers: corsHeaders }
    );

  } catch (error) {
    console.error("[STRIPE_SESSION_ERROR]", error);
    return new NextResponse("Internal Server Error", {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}