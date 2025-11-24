import { NextResponse } from "next/server";
import { verifyCustomerToken } from "@/lib/verify-customer-token";
import { hasActiveSubscription } from "@/lib/subscription";
import prismadb from "@/lib/prismadb";

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
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": allowOrigin !== "*" ? "true" : "false",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
};

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 200,
    headers: getCorsHeaders(origin),
  });
}

export async function GET(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  try {
    const { storeId } = await context.params;

    if (!storeId) {
      return new NextResponse("Store ID is required.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Verify user authentication
    const authHeader = req.headers.get("authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      return new NextResponse("Unauthorized - Missing or invalid authorization header", {
        status: 401,
        headers: corsHeaders,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    
    let userId: string;
    try {
      userId = await verifyCustomerToken(token);
    } catch (tokenError) {
      return new NextResponse(
        tokenError instanceof Error ? `Token verification failed: ${tokenError.message}` : "Invalid or expired token",
        { 
          status: 401, 
          headers: corsHeaders 
        }
      );
    }

    if (!userId) {
      return new NextResponse("Invalid or expired token", {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Check if user has active subscription
    const hasSubscription = await hasActiveSubscription(userId, storeId);

    if (!hasSubscription) {
      return new NextResponse("Active subscription required to view download statistics.", {
        status: 403,
        headers: corsHeaders,
      });
    }

    // Get user's download statistics
    // Total downloads (all downloads by this user for this store)
    const totalDownloads = await prismadb.download.count({
      where: {
        userId,
        storeId,
      },
    });

    // Premium downloads (paid products downloaded by this user)
    const premiumDownloads = await prismadb.download.count({
      where: {
        userId,
        storeId,
        isFree: false,
      },
    });

    // Free downloads (free products downloaded by this user)
    const freeDownloads = await prismadb.download.count({
      where: {
        userId,
        storeId,
        isFree: true,
      },
    });

    const stats = {
      totalDownloads,
      premiumDownloads,
      freeDownloads,
    };

    return NextResponse.json(stats, { headers: corsHeaders });
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Internal Server Error",
      { 
        status: 500, 
        headers: corsHeaders 
      }
    );
  }
}

