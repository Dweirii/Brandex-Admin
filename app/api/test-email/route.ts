import { NextResponse } from "next/server";
import { sendOrderNotificationToAdmin } from "@/lib/email";

export async function GET() {
  try {
    console.log("📧 Testing email service...");
    console.log("RESEND_API_KEY:", process.env.RESEND_API_KEY ? "✅ Set" : "❌ Missing");
    console.log("ADMIN_EMAIL:", process.env.ADMIN_EMAIL || "Using default: zaid@dweiri.dev");

    const testData = {
      orderId: "test-order-123",
      customerEmail: "test@example.com",
      customerName: "Test Customer",
      totalAmount: 99.99,
      products: [
        { name: "Test Product 1", price: 49.99 },
        { name: "Test Product 2", price: 50.00 },
      ],
      storeName: "Test Store",
      paymentMethod: "Test Payment",
      orderDate: new Date(),
    };

    const result = await sendOrderNotificationToAdmin(testData);

    if (result) {
      return NextResponse.json({
        success: true,
        message: "Test email sent successfully!",
        adminEmail: process.env.ADMIN_EMAIL || "zaid@dweiri.dev",
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to send test email. Check server logs for details.",
          adminEmail: process.env.ADMIN_EMAIL || "zaid@dweiri.dev",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("❌ Error in test email endpoint:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Error sending test email",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

