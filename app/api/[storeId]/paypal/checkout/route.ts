import { NextResponse } from "next/server"
import { getPayPalAccessToken } from "@/lib/paypal"
import prismadb from "@/lib/prismadb"
import { verifyCustomerToken } from "@/lib/verify-customer-token"

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": allowOrigin !== "*" ? "true" : "false",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
};

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  const { storeId } = await context.params; 

  try {
    if (!storeId) {
      return new NextResponse("Store ID is required.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const authHeader = req.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: corsHeaders,
      })
    }

    const token = authHeader.replace("Bearer ", "")
    const userId = await verifyCustomerToken(token)

    if (!userId) {
      return new NextResponse("Unauthorized", {
        status: 403,
        headers: corsHeaders,
      })
    }

    const body = await req.json()
    const { productIds, email } = body

    if (!Array.isArray(productIds) || productIds.length === 0 || !email) {
      return new NextResponse("Invalid request data.", {
        status: 400,
        headers: corsHeaders,
      })
    }

    const products = await prismadb.product.findMany({
      where: {
        id: { in: productIds },
        storeId,
      },
    })

    if (!products.length) {
      return new NextResponse("No valid products found.", {
        status: 400,
        headers: corsHeaders,
      })
    }

    const totalPrice = products.reduce(
      (acc, p) => acc + p.price.toNumber(),
      0
    )

    if (totalPrice < 0.6) {
      return new NextResponse("Minimum payment amount is $0.60", {
        status: 400,
        headers: corsHeaders,
      })
    }

    const order = await prismadb.order.create({
      data: {
        storeId,
        email,
        userId,
        isPaid: false,
        price: totalPrice,
        orderItems: {
          create: products.map((p) => ({
            product: { connect: { id: p.id } },
          })),
        },
      },
    })

    const accessToken = await getPayPalAccessToken()

    const paypalRes = await fetch(
      `${process.env.PAYPAL_API_URL}/v2/checkout/orders`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: {
                currency_code: "USD",
                value: totalPrice.toFixed(2),
              },
              custom_id: order.id,
            },
          ],
          application_context: {
            brand_name: "Brandex Store",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: `${process.env.FRONTEND_STORE_URL}/thank-you?provider=paypal`,
            cancel_url: `${process.env.FRONTEND_STORE_URL}/cart?canceled=1`,
          },
        }),
      }
    )

    const paypalData = await paypalRes.json()

    if (!paypalRes.ok) {
      console.error("PayPal order creation failed", paypalData)
      return new NextResponse("Failed to create PayPal order", {
        status: 500,
        headers: corsHeaders,
      })
    }

    const approvalUrl = paypalData.links?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (link: any) => link.rel === "approve"
    )?.href

    if (!approvalUrl) {
      return new NextResponse("Approval URL not found", {
        status: 500,
        headers: corsHeaders,
      })
    }

    return NextResponse.json({ url: approvalUrl }, { headers: corsHeaders })
  } catch (error) {
    console.error("[PAYPAL_CHECKOUT_ERROR]", error)
    return new NextResponse("Internal Server Error", {
      status: 500,
      headers: corsHeaders,
    })
  }
}
