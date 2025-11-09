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

export interface SummaryReportData {
  storeId: string;
  storeName: string;
  period: 'daily' | 'weekly' | 'monthly';
  startDate: Date;
  endDate: Date;
  freeDownloads: number;
  paidDownloads: number;
  paidOrders: number;
  totalRevenue: number;
  totalDownloads: number;
  stockCount: number;
  topProducts: Array<{
    name: string;
    downloadsCount: number;
    price: number;
  }>;
  revenueByMonth?: Array<{
    name: string;
    total: number;
  }>;
  revenueGrowth?: number;
  bestPerformingProduct?: {
    name: string;
    downloadsCount: number;
    revenue?: number;
  };
  conversionRate: number;
}

export async function sendSummaryReportToAdmin(data: SummaryReportData) {
  try {
    const periodLabel = data.period === 'daily' ? 'Daily' : 
                       data.period === 'weekly' ? 'Weekly' : 'Monthly';
    
    const growthColor = (growth?: number) => {
      if (!growth) return '#666';
      return growth >= 0 ? '#28a745' : '#dc3545';
    };

    const formatGrowth = (growth?: number) => {
      if (growth === undefined || growth === null) return 'N/A';
      const sign = growth >= 0 ? '+' : '';
      return `${sign}${growth.toFixed(2)}%`;
    };

    const { data: emailData, error } = await resend.emails.send({
      from: "Brandex Store <noreply@bsi-labs.org>",
      to: [ADMIN_EMAIL],
      subject: `${periodLabel} Business Summary Report - ${data.storeName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; border-bottom: 3px solid #007bff; padding-bottom: 10px;">
            ${periodLabel} Business Summary Report
          </h1>
          
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Store:</strong> ${data.storeName}</p>
            <p><strong>Period:</strong> ${data.startDate.toLocaleDateString()} - ${data.endDate.toLocaleDateString()}</p>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0;">
            <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px;">
              <h3 style="color: #1976d2; margin-top: 0;">Total Revenue</h3>
              <p style="font-size: 28px; font-weight: bold; color: #333;">$${data.totalRevenue.toFixed(2)}</p>
              ${data.revenueGrowth !== undefined ? `
                <p style="color: ${growthColor(data.revenueGrowth)}; font-size: 14px; margin-top: 5px;">
                  ${formatGrowth(data.revenueGrowth)} vs previous period
                </p>
              ` : ''}
            </div>
            
            <div style="background-color: #f3e5f5; padding: 20px; border-radius: 8px;">
              <h3 style="color: #7b1fa2; margin-top: 0;">Paid Orders</h3>
              <p style="font-size: 28px; font-weight: bold; color: #333;">${data.paidOrders}</p>
            </div>
            
            <div style="background-color: #e8f5e9; padding: 20px; border-radius: 8px;">
              <h3 style="color: #388e3c; margin-top: 0;">Free Downloads</h3>
              <p style="font-size: 28px; font-weight: bold; color: #333;">${data.freeDownloads.toLocaleString()}</p>
            </div>
            
            <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px;">
              <h3 style="color: #f57c00; margin-top: 0;">Paid Downloads</h3>
              <p style="font-size: 28px; font-weight: bold; color: #333;">${data.paidDownloads.toLocaleString()}</p>
            </div>
            
            <div style="background-color: #fce4ec; padding: 20px; border-radius: 8px;">
              <h3 style="color: #c2185b; margin-top: 0;">Total Downloads</h3>
              <p style="font-size: 28px; font-weight: bold; color: #333;">${data.totalDownloads.toLocaleString()}</p>
            </div>
            
            <div style="background-color: #e0f2f1; padding: 20px; border-radius: 8px;">
              <h3 style="color: #00796b; margin-top: 0;">Conversion Rate</h3>
              <p style="font-size: 28px; font-weight: bold; color: #333;">${data.conversionRate.toFixed(2)}%</p>
              <p style="font-size: 12px; color: #666; margin-top: 5px;">Paid / Total Downloads</p>
            </div>
          </div>

          ${data.bestPerformingProduct ? `
          <div style="background-color: #fff9c4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #fbc02d;">
            <h3 style="color: #333; margin-top: 0;">⭐ Best Performing Product</h3>
            <p style="font-size: 18px; font-weight: bold; color: #333; margin: 10px 0;">
              ${data.bestPerformingProduct.name}
            </p>
            <p style="color: #666; margin: 5px 0;">
              <strong>Downloads:</strong> ${data.bestPerformingProduct.downloadsCount.toLocaleString()}
            </p>
            ${data.bestPerformingProduct.revenue ? `
              <p style="color: #666; margin: 5px 0;">
                <strong>Revenue:</strong> $${data.bestPerformingProduct.revenue.toFixed(2)}
              </p>
            ` : ''}
          </div>
          ` : ''}

          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">Top Downloaded Products</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #007bff; color: white;">
                  <th style="padding: 12px; text-align: left;">Product Name</th>
                  <th style="padding: 12px; text-align: right;">Downloads</th>
                  <th style="padding: 12px; text-align: right;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${data.topProducts.map((product, index) => `
                  <tr style="border-bottom: 1px solid #ddd; ${index % 2 === 0 ? 'background-color: white;' : 'background-color: #f8f9fa;'}">
                    <td style="padding: 10px;">${product.name}</td>
                    <td style="padding: 10px; text-align: right;">${product.downloadsCount.toLocaleString()}</td>
                    <td style="padding: 10px; text-align: right;">$${product.price.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          ${data.revenueByMonth && data.revenueByMonth.length > 0 ? `
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">Monthly Revenue Breakdown</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #007bff; color: white;">
                  <th style="padding: 12px; text-align: left;">Month</th>
                  <th style="padding: 12px; text-align: right;">Revenue</th>
                </tr>
              </thead>
              <tbody>
                ${data.revenueByMonth.map((month, index) => `
                  <tr style="border-bottom: 1px solid #ddd; ${index % 2 === 0 ? 'background-color: white;' : 'background-color: #f8f9fa;'}">
                    <td style="padding: 10px;">${month.name}</td>
                    <td style="padding: 10px; text-align: right;">$${month.total.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ` : ''}

          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.ADMIN_DASHBOARD_URL || "#"}"
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Full Dashboard
            </a>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("❌ Failed to send summary report email:", error);
      return false;
    }

    console.log("✅ Summary report email sent successfully:", emailData);
    return true;
  } catch (error) {
    console.error("❌ Exception in summary report email:", error);
    return false;
  }
}
