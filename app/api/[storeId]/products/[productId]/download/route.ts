import { NextResponse } from "next/server";
import crypto from "crypto";
import prismadb from "@/lib/prismadb";
import { verifyCustomerToken } from "@/lib/verify-customer-token";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
};

const BUNNY_SIGNING_KEY = process.env.BUNNY_SIGNING_KEY!;
const BUNNY_PULL_ZONE_URL = process.env.BUNNY_PULL_ZONE_URL!;
const LINK_EXPIRATION_SECONDS = 300;

export async function OPTIONS(): Promise<Response> {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(
  req: Request,
  context: { params: Promise<{ storeId: string; productId: string }> }
): Promise<Response> {
  try {
    const { storeId, productId } = await context.params;

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new NextResponse("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace("Bearer ", "");
    const userId = await verifyCustomerToken(token); 


    const product = await prismadb.product.findFirst({
      where: { id: productId, storeId },
    });

    if (!product?.downloadUrl) {
      return new NextResponse("Product Not Found", {
        status: 404,
        headers: corsHeaders,
      });
    }


    const paidOrders = await prismadb.order.findMany({
      where: {
        userId,
        isPaid: true,
        orderItems: {
          some: { productId },
        },
      },
    });

    if (paidOrders.length === 0) {
      return new NextResponse("Unauthorized or unpaid", {
        status: 403,
        headers: corsHeaders,
      });
    }

    const filePath = product.downloadUrl.startsWith("/")
      ? product.downloadUrl
      : `/${product.downloadUrl}`;

    const expires = Math.floor(Date.now() / 1000) + LINK_EXPIRATION_SECONDS;
    const tokenInput = `${BUNNY_SIGNING_KEY}${filePath}${expires}`;
    const tokenHash = crypto.createHash("md5").update(tokenInput).digest("hex");
    const encodedPath = product.downloadUrl.replace(/^\//, "");

    const signedUrl = `${BUNNY_PULL_ZONE_URL}/${encodedPath}?token=${tokenHash}&expires=${expires}`;

    return new NextResponse(JSON.stringify({ url: signedUrl }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[DownloadHandler] Error:", error);
    return new NextResponse("Internal Server Error", {
      status: 500,
      headers: corsHeaders,
    });
  }
}
