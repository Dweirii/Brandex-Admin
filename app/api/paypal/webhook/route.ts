import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { sendOrderNotificationToAdmin} from "@/lib/email";


async function getPayPalToken() {
  const res = await fetch(`${process.env.PAYPAL_API_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(
          process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_CLIENT_SECRET
        ).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token;
}

async function verifySignature(rawBody: string, headers: Headers) {
  const token = await getPayPalToken();

  const payload = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
    webhook_event: JSON.parse(rawBody),
  };

  const res = await fetch(
    `${process.env.PAYPAL_API_URL}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    }
  );
  const result = await res.json();
  return result.verification_status === "SUCCESS";
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const headers = req.headers;

  if (!(await verifySignature(rawBody, headers))) {
    console.error("Invalid PayPal signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
    return NextResponse.json({ message: "Ignored event" }, { status: 200 });
  }

  const orderId = event.resource?.custom_id;
  const captureId = event.resource?.id;
  if (!orderId || !captureId) {
    return NextResponse.json({ error: "Missing IDs" }, { status: 400 });
  }

  const order = await prismadb.order.findUnique({ 
    where: { id: orderId },
    include: {
      OrderItem: {
        include: {
          products: true,
        },
      },
      Store: true,
    },
  });
  
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.isPaid) return NextResponse.json({ message: "Already paid" }, { status: 200 });

  await prismadb.order.update({
    where: { id: orderId },
    data: {
      isPaid: true,
      sessionVerified: true,
      paymentProvider: "paypal",
      transactionId: captureId,
    },
  });
  console.log(`Order ${orderId} marked paid via PayPal`);

  // Get actual payment amount from PayPal
  const actualPaymentAmount = event.resource?.amount?.value 
    ? parseFloat(event.resource.amount.value)
    : order.price?.toNumber() || 0;

  console.log("💰 Payment Amount - Order Price:", order.price?.toNumber() || 0);
  console.log("💰 Payment Amount - Actual Paid (PayPal):", actualPaymentAmount);

  if (order.email) {
    // Prepare email data
    const emailData = {
      orderId: order.id,
      customerEmail: order.email,
      totalAmount: actualPaymentAmount, // Use actual payment amount
      products: order.OrderItem.map(item => ({
        name: item.products.name,
        price: item.products.price.toNumber(),
      })),
      storeName: order.Store.name,
      paymentMethod: "PayPal",
      orderDate: order.createdAt,
    };

    // Send notification to admin
    console.log("📧 Sending admin email to:", process.env.ADMIN_EMAIL);
    console.log("📧 Email will show payment amount: $", actualPaymentAmount.toFixed(2));
    await sendOrderNotificationToAdmin(emailData);
  }

  return NextResponse.json({ message: "OK" }, { status: 200 });
}
