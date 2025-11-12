import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { verifyCustomerToken } from "@/lib/verify-customer-token";
import { checkSubscriptionAccess } from "@/lib/subscription";

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
    "Access-Control-Max-Age": "86400",
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

    const product = await prismadb.products.findFirst({
      where: { id: productId, storeId },
    });

    if (!product?.downloadUrl) {
      return new NextResponse("Product Not Found", {
        status: 404,
        headers: corsHeaders,
      });
    }

    const isFreeProduct = product.price.equals(0);

    let userId: string | null = null;

    if (!isFreeProduct) {
      const authHeader = req.headers.get("authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new NextResponse("Unauthorized", { status: 401, headers: corsHeaders });
      }

      const token = authHeader.replace("Bearer ", "");
      
      try {
        userId = await verifyCustomerToken(token);
      } catch (tokenError) {
        console.error("[DOWNLOAD_ERROR] Token verification failed:", tokenError);
        return new NextResponse("Unauthorized - Invalid or expired token", {
          status: 401,
          headers: corsHeaders,
        });
      }

      const hasAccess = await checkSubscriptionAccess(userId, productId, storeId);

      if (!hasAccess) {
        console.log("[DOWNLOAD_ERROR] Access denied", {
          userId,
          productId,
          storeId,
        });
        return new NextResponse("Unauthorized - No subscription or purchase found for this product", {
          status: 403,
          headers: corsHeaders,
        });
      }
    }

    const fileResponse = await fetch(product.downloadUrl);

    await prismadb.products.update({
      where: { id: productId },
      data: {
        downloadsCount: { increment: 1 },
      },
    });

    await prismadb.downloads.create({
      data: {
        id: crypto.randomUUID(),
        productId,
        storeId,
        userId: userId || null,
        email: null,
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
