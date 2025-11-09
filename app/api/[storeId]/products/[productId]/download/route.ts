import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { verifyCustomerToken } from "@/lib/verify-customer-token";

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

export async function OPTIONS(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  });
}

export async function GET(
  req: Request,
  context: { params: Promise<{ storeId: string; productId: string }> }
): Promise<Response> {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
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

    // Update download counter (keep for backward compatibility)
    await prismadb.product.update({
      where: { id: productId },
      data: {
        downloadsCount: { increment: 1 },
      },
    });

    // Create download record for period-specific tracking
    await prismadb.download.create({
      data: {
        productId,
        storeId,
        userId: null, // TODO: Add user tracking if auth is available
        email: null,  // TODO: Extract from order/user if available
        isFree: product.price.equals(0),
      },
    });

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
