import Stripe from "stripe";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import prismadb from "@/lib/prismadb";
import { sendOrderNotificationToAdmin } from "@/lib/email";

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
    console.error("❌ Webhook Signature Error:", error);
    return new NextResponse(`Webhook Error: ${error}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const orderId = session?.metadata?.orderId;
    if (!orderId) {
      console.warn("⚠️ No orderId in session metadata");
      return new NextResponse("No order ID", { status: 400 });
    }

    try {
      const updatedOrder = await prismadb.order.update({
        where: { id: orderId },
        data: { isPaid: true },
        include: {
          orderItems: {
            include: {
              product: true,
            },
          },
          store: true,
        },
      });

      console.log("✅ Order marked as paid:", updatedOrder.id);

      // Get actual payment amount from Stripe (amount_total is in cents)
      const actualPaymentAmount = session.amount_total 
        ? session.amount_total / 100 
        : updatedOrder.price?.toNumber() || 0;

      console.log("💰 Payment Amount - Order Price:", updatedOrder.price?.toNumber() || 0);
      console.log("💰 Payment Amount - Actual Paid (Stripe):", actualPaymentAmount);

      const emailData = {
        orderId: updatedOrder.id,
        customerEmail: updatedOrder.email || "unknown@customer.com",
        customerName: session.customer_details?.name ?? undefined,
        totalAmount: actualPaymentAmount, // Use actual payment amount
        products: updatedOrder.orderItems.map((item) => ({
          name: item.product.name,
          price: item.product.price.toNumber(),
        })),
        storeName: updatedOrder.store.name,
        paymentMethod: session.payment_method_types?.[0] ?? "Stripe",
        orderDate: updatedOrder.createdAt,
      };

      console.log("📧 Sending admin email to:", process.env.ADMIN_EMAIL);
      console.log("📧 Email will show payment amount: $", actualPaymentAmount.toFixed(2));
      await sendOrderNotificationToAdmin(emailData);

    } catch (error) {
      console.error("❌ Error updating order in DB:", error);
      return new NextResponse("Database update error", { status: 500 });
    }
  }

  return new NextResponse(null, { status: 200 });
}
