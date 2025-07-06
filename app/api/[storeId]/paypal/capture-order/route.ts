// app/api/paypal/capture-order/route.ts
import { NextRequest, NextResponse } from "next/server"
import prismadb from "@/lib/prismadb"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
}

async function generateAccessToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64")
  const res = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  })
  const data = await res.json()
  return data.access_token
}

export async function POST(req: NextRequest) {
  try {
    const { orderID } = await req.json()
    const accessToken = await generateAccessToken()

    const captureRes = await fetch(
      `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderID}/capture`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    const captureData = await captureRes.json()

    const orderId = captureData?.purchase_units?.[0]?.custom_id
    const status = captureData?.status

    if (status === "COMPLETED" && orderId) {
      await prismadb.order.update({
        where: { id: orderId },
        data: {
          isPaid: true,
          sessionVerified: true,
        },
      })
    }

    return NextResponse.json(captureData, { headers: corsHeaders })
  } catch (error) {
    console.error("[PAYPAL_CAPTURE_ORDER]", error)
    return new NextResponse("Internal Server Error", { status: 500, headers: corsHeaders })
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}
