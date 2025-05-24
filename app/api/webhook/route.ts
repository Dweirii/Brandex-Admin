import Stripe from "stripe";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import prismadb from "@/lib/prismadb";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature") as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      Buffer.from(body),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    console.error("Webhook Signature Error:", error);
    return new NextResponse(`Webhook Error: ${error}`, { status: 400 });
  }


  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;


    const orderId = session?.metadata?.orderId;
    if (!orderId) {
      console.warn("No orderId in session metadata");
      return new NextResponse("No order ID", { status: 400 });
    }


    try {
      const updatedOrder = await prismadb.order.update({
        where: {
          id: orderId,
        },
        data: {
          isPaid: true,
        },
        include: {
          orderItems: true,
        },
      });

      console.log("Order updated:", updatedOrder.id);
    } catch (error) {
      console.error("Error updating order in DB:", error);
      return new NextResponse("Database update error", { status: 500 });
    }
  }

  return new NextResponse(null, { status: 200 });
}
