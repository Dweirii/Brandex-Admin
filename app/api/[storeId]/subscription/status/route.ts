
import { NextResponse } from "next/server";
import { verifyCustomerToken } from "@/lib/verify-customer-token";
import { getSubscriptionStatus, getSubscriptionStatusInfo, hasActiveSubscription } from "@/lib/subscription";

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
    "Access-Control-Max-Age": "86400",
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

    const subscription = await getSubscriptionStatus(userId, storeId);

    if (!subscription) {
      const cacheHeaders = {
        ...corsHeaders,
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      };
      return NextResponse.json(
        {
          hasSubscription: false,
          isActive: false,
          subscription: null,
        },
        { headers: cacheHeaders }
      );
    }

    const isActive = await hasActiveSubscription(userId, storeId);

    const statusInfo = getSubscriptionStatusInfo({
      status: subscription.status,
      trialStart: subscription.trialStart,
      trialEnd: subscription.trialEnd,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    });

    const response = {
      hasSubscription: true,
      isActive,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        statusDescription: statusInfo.description,
        daysRemaining: statusInfo.daysRemaining,
        currentPeriodStart: subscription.currentPeriodStart
          ? new Date(subscription.currentPeriodStart).toISOString()
          : null,
        currentPeriodEnd: subscription.currentPeriodEnd
          ? new Date(subscription.currentPeriodEnd).toISOString()
          : null,
        trialStart: subscription.trialStart
          ? new Date(subscription.trialStart).toISOString()
          : null,
        trialEnd: subscription.trialEnd
          ? new Date(subscription.trialEnd).toISOString()
          : null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripeCustomerId: subscription.stripeCustomerId,
        createdAt: new Date(subscription.createdAt).toISOString(),
        updatedAt: new Date(subscription.updatedAt).toISOString(),
        store: subscription.Store
          ? {
              id: subscription.Store.id,
              name: subscription.Store.name,
            }
          : null,
      },
    };

    // Add cache headers to reduce API calls
    const cacheHeaders = {
      ...corsHeaders,
      "Cache-Control": "private, max-age=60, stale-while-revalidate=300", // Cache for 60s, serve stale for 5min
    };

    return NextResponse.json(response, { headers: cacheHeaders });
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