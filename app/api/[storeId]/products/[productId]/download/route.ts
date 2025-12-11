import { NextResponse } from "next/server";
import prismadb from "@/lib/prismadb";
import { verifyCustomerToken } from "@/lib/verify-customer-token";
import { checkSubscriptionAccess } from "@/lib/subscription";
import { buildDownloadFilename } from "@/lib/utils";

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
    // include x-user-id so free downloads can attach to users
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-user-id",
    "Access-Control-Expose-Headers": "Content-Disposition",
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
  const headerUserId = req.headers.get("x-user-id");
  const authHeader = req.headers.get("authorization");

  try {
    const { storeId, productId } = await context.params;

    const product = await prismadb.products.findFirst({
      where: { id: productId, storeId },
      include: {
        Category: true,
      },
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
    } else {
      // For free products, try to associate the download with a user when available
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        try {
          userId = await verifyCustomerToken(token);
        } catch (tokenError) {
          console.warn("[DOWNLOAD_FREE] Optional token verification failed, continuing as guest", tokenError);
        }
      }

      if (!userId && headerUserId) {
        userId = headerUserId;
      }
    }

    // Add timeout and proper headers for CDN fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
    let fileResponse: Response;
    
    try {
      fileResponse = await fetch(product.downloadUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Brandex/1.0)',
        },
        redirect: 'follow',
      });
      
      clearTimeout(timeoutId);
      
      if (!fileResponse.ok || !fileResponse.body) {
        console.error('[DOWNLOAD_ERROR] CDN fetch failed:', {
          status: fileResponse.status,
          statusText: fileResponse.statusText,
          url: product.downloadUrl,
          productId,
          productName: product.name,
        });
        
        // Return specific error message for CDN issues
        if (fileResponse.status === 404) {
          return new NextResponse("CDN_ERROR: The file is temporarily unavailable due to a global CDN issue. This is not from our system. Please try again in a few moments.", {
            status: 503,
            headers: corsHeaders,
          });
        }
        
        return new NextResponse(`CDN_ERROR: Failed to fetch file from storage provider (Status: ${fileResponse.status})`, {
          status: 503,
          headers: corsHeaders,
        });
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('[DOWNLOAD_ERROR] CDN fetch exception:', {
        error: fetchError,
        url: product.downloadUrl,
        productId,
        productName: product.name,
      });
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new NextResponse("CDN_ERROR: The download is taking longer than expected due to a temporary service issue. Please try again in a moment.", {
          status: 503,
          headers: corsHeaders,
        });
      }
      
      return new NextResponse("CDN_ERROR: Unable to retrieve file from storage provider. This is a temporary issue. Please try again shortly.", {
        status: 503,
        headers: corsHeaders,
      });
    }

    // Track download AFTER successful fetch
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

    // Extract extension from CDN URL and build proper filename
    const categoryName = product.Category?.name || "Product";
    const fileName = buildDownloadFilename(product.downloadUrl, `Brandex-${categoryName}`);

    // Get content length if available
    const contentLength = fileResponse.headers.get("content-length");
    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    };

    if (contentLength) {
      responseHeaders["Content-Length"] = contentLength;
    }

    return new NextResponse(fileResponse.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[DownloadHandler] Error:", error);
    return new NextResponse("Internal Server Error", {
      status: 500,
      headers: corsHeaders,
    });
  }
}
