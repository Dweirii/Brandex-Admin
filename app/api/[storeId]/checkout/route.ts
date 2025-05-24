import prismadb from "@/lib/prismadb";
import { stripe } from "@/lib/stripe";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { Stripe } from "stripe";
import { verifyCustomerToken } from "@/lib/verify-customer-token"; 

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const { storeId } = await context.params;

  if (!storeId) {
    return new NextResponse("Store ID is required.", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const body = await req.json();
  const { productIds, email } = body;

  if (!productIds || productIds.length === 0) {
    return new NextResponse("Product IDs are required.", {
      status: 400,
      headers: corsHeaders,
    });
  }


  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new NextResponse("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const token = authHeader.replace("Bearer ", "");
  const userId = await verifyCustomerToken(token); 

  const products = await prismadb.product.findMany({
    where: {
      id: {
        in: productIds,
      },
    },
  });

  const totalPrice = products.reduce((total, product) => {
    return total + product.price.toNumber();
  }, 0);

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = products.map((product) => ({
    quantity: 1,
    price_data: {
      currency: "USD",
      product_data: {
        name: product.name,
      },
      unit_amount: product.price.toNumber() * 100,
    },
  }));

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
    },
  });

  return NextResponse.json({ url: session.url }, { headers: corsHeaders });
}
