import prismadb from "@/lib/prismadb";
import { stripe } from "@/lib/stripe";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { Stripe } from "stripe";
import { verifyCustomerToken } from "@/lib/verify-customer-token"; 

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
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": allowOrigin !== "*" ? "true" : "false",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
};

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(origin),
  });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  try {
    const { storeId } = await context.params;

    if (!storeId) {
      console.error("[CHECKOUT_ERROR] Missing storeId");
      return new NextResponse("Store ID is required.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("[CHECKOUT_ERROR] Failed to parse request body:", parseError);
      return new NextResponse("Invalid JSON in request body", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { productIds, email } = body;

    if (!productIds || productIds.length === 0) {
      console.error("[CHECKOUT_ERROR] Missing productIds");
      return new NextResponse("Product IDs are required.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[CHECKOUT_ERROR] Missing or invalid authorization header");
      return new NextResponse("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace("Bearer ", "");
    
    let userId;
    try {
      userId = await verifyCustomerToken(token);
    } catch (tokenError) {
      console.error("[CHECKOUT_ERROR] Token verification failed:", tokenError);
      return new NextResponse(
        tokenError instanceof Error ? `Token verification failed: ${tokenError.message}` : "Invalid or expired token",
        { 
          status: 401, 
          headers: corsHeaders 
        }
      );
    }

    if (!userId) {
      console.error("[CHECKOUT_ERROR] Token verification returned no userId");
      return new NextResponse("Invalid or expired token", { 
        status: 401, 
        headers: corsHeaders 
      });
    }

    console.log("[CHECKOUT_INFO] Fetching products for productIds:", productIds);
    const products = await prismadb.product.findMany({
      where: {
        id: {
          in: productIds,
        },
      },
    });

    if (products.length === 0) {
      console.error("[CHECKOUT_ERROR] No products found for the given IDs");
      return new NextResponse("No valid products found", {
        status: 400,
        headers: corsHeaders,
      });
    }

    console.log("[CHECKOUT_INFO] Found products:", products.length);

    // Log individual product prices
    products.forEach((product) => {
      console.log(`[CHECKOUT_INFO] Product: ${product.name}, Price: $${product.price.toNumber()}, Price in cents: ${product.price.toNumber() * 100}`);
    });

    const totalPrice = products.reduce((total, product) => {
      return total + product.price.toNumber();
    }, 0);

    console.log("[CHECKOUT_INFO] Total price (dollars):", totalPrice);
    console.log("[CHECKOUT_INFO] Total price (cents):", totalPrice * 100);

    if(totalPrice < 0.6) {
      console.error("[CHECKOUT_ERROR] Price below minimum:", totalPrice);
      return new NextResponse("Minimun payment amount is 0.60", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = products.map((product) => {
      const unitAmount = Math.round(product.price.toNumber() * 100);
      console.log(`[CHECKOUT_INFO] Line item - Product: ${product.name}, Unit amount (cents): ${unitAmount}`);
      return {
        quantity: 1,
        price_data: {
          currency: "USD",
          product_data: {
            name: product.name,
          },
          unit_amount: unitAmount,
        },
      };
    });

    // Log total of all line items
    const totalLineItemsAmount = line_items.reduce((sum, item) => sum + (item.price_data?.unit_amount || 0), 0);
    console.log("[CHECKOUT_INFO] Total line items amount (cents):", totalLineItemsAmount);
    console.log("[CHECKOUT_INFO] Total line items amount (dollars):", totalLineItemsAmount / 100);

    console.log("[CHECKOUT_INFO] Creating order in database");
    const order = await prismadb.order.create({
      data: {
        storeId,
        isPaid: false,
        email,
        userId, 
        price: new Prisma.Decimal(totalPrice),
        orderItems: {
          create: productIds.map((productId: string) => ({
            product: { connect: { id: productId } },
          })),
        },
      },
    });

    console.log("[CHECKOUT_INFO] Order created:", order.id);
    console.log("[CHECKOUT_INFO] Order total price:", order.price ? order.price.toNumber() : "N/A");
    console.log("[CHECKOUT_INFO] Creating Stripe checkout session");

    const session = await stripe.checkout.sessions.create({
      line_items,
      mode: "payment",
      billing_address_collection: "required",
      phone_number_collection: { enabled: true },
      customer_creation: "always",
      success_url: `${process.env.FRONTEND_STORE_URL}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_STORE_URL}/cart?canceled=1`,
      metadata: {
        orderId: order.id,
        email,
        expectedTotal: totalPrice.toString(),
      },
    });

    console.log("[CHECKOUT_INFO] Stripe session created:", session.id);
    console.log("[CHECKOUT_INFO] Stripe session amount_total (cents):", session.amount_total);
    console.log("[CHECKOUT_INFO] Stripe session amount_total (dollars):", session.amount_total ? session.amount_total / 100 : "N/A");
    console.log("[CHECKOUT_INFO] Stripe session amount_subtotal (cents):", session.amount_subtotal);
    console.log("[CHECKOUT_INFO] Stripe session amount_subtotal (dollars):", session.amount_subtotal ? session.amount_subtotal / 100 : "N/A");
    
    return NextResponse.json({ url: session.url }, { headers: corsHeaders });
  } catch (error) {
    console.error("[CHECKOUT_ERROR]", error);
    return new NextResponse(
      error instanceof Error ? error.message : "Internal Server Error",
      { 
        status: 500, 
        headers: corsHeaders 
      }
    );
  }
}
