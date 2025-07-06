// app/api/paypal/create-order/route.ts
import { NextRequest, NextResponse } from "next/server"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
}

async function generateAccessToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64")

  const response = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  })

  const data = await response.json()
  return data.access_token
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { orderId, total } = body

    const accessToken = await generateAccessToken()

    const response = await fetch("https://api-m.sandbox.paypal.com/v2/checkout/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "USD",
              value: total,
            },
            custom_id: orderId, // to track the order
          },
        ],
        application_context: {
          return_url: `${process.env.FRONTEND_STORE_URL}/thank-you?paypal=1`,
          cancel_url: `${process.env.FRONTEND_STORE_URL}/cart`,
        },
      }),
    })

    const data = await response.json()

    return NextResponse.json(data, { headers: corsHeaders })
  } catch (error) {
    console.error("[PAYPAL_CREATE_ORDER]", error)
    return new NextResponse("Internal Server Error", { status: 500, headers: corsHeaders })
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  })
}
