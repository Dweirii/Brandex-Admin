import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { verifyCustomerToken } from "@/lib/verify-customer-token";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
};

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

    const product = await prismadb.product.findFirst({
      where: { id: productId, storeId },
    });

    if (!product?.downloadUrl) {
      return new NextResponse("Product Not Found", {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Check if product is free (price is 0)
    const isFreeProduct = product.price.equals(0);

    if (!isFreeProduct) {
      // For paid products, require authentication and payment verification
      const authHeader = req.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new NextResponse("Unauthorized", { status: 401, headers: corsHeaders });
      }

      const token = authHeader.replace("Bearer ", "");
      const userId = await verifyCustomerToken(token);

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
    }

    // Fetch the file from BunnyCDN or any other source
    const fileResponse = await fetch(product.downloadUrl);

    if (!fileResponse.ok || !fileResponse.body) {
      return new NextResponse("Failed to fetch file", {
        status: 500,
        headers: corsHeaders,
      });
    }

    const fileName = product.downloadUrl.split("/").pop() ?? "file";

    return new NextResponse(fileResponse.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": fileResponse.headers.get("Content-Type") || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"`,
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
