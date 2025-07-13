import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "zaid@dweiri.dev";

export interface OrderEmailData {
  orderId: string;
  customerEmail: string;
  customerName?: string;
  totalAmount: number;
  products: Array<{
    name: string;
    price: number;
  }>;
  storeName: string;
  paymentMethod: string;
  orderDate: Date;
}

export async function sendOrderNotificationToAdmin(data: OrderEmailData) {
  try {
    const { data: emailData, error } = await resend.emails.send({
      from: "Brandex Store <noreply@bsi-labs.org>",
      to: [ADMIN_EMAIL],
      subject: `New Order - ${data.storeName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New order received</h2>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Order Details</h3>
            <p><strong>Order ID:</strong> ${data.orderId}</p>
            <p><strong>Date:</strong> ${data.orderDate.toDateString()}</p>
            <p><strong>Payment Method:</strong> ${data.paymentMethod}</p>
            <p><strong>Total:</strong> $${data.totalAmount.toFixed(2)}</p>
          </div>

          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Customer</h3>
            <p><strong>Email:</strong> ${data.customerEmail}</p>
            ${data.customerName ? `<p><strong>Name:</strong> ${data.customerName}</p>` : ""}
          </div>

          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Products</h3>
            <ul style="list-style: none; padding: 0;">
              ${data.products
                .map(
                  (product) => `
                    <li style="padding: 10px 0; border-bottom: 1px solid #ddd;">
                      <strong>${product.name}</strong> - $${product.price.toFixed(2)}
                    </li>
                  `
                )
                .join("")}
            </ul>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.ADMIN_DASHBOARD_URL || "#"}"
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
              View in Dashboard
            </a>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("❌ Failed to send admin email:", error);
      return false;
    }

    console.log("✅ Admin email sent successfully:", emailData);
    return true;
  } catch (error) {
    console.error("❌ Exception in admin email:", error);
    return false;
  }
}
