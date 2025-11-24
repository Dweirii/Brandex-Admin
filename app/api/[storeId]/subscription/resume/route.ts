import { NextResponse } from "next/server";
import { verifyCustomerToken } from "@/lib/verify-customer-token";
import { getSubscriptionStatus } from "@/lib/subscription";
import { stripe } from "@/lib/stripe";
import prismadb from "@/lib/prismadb";

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

export async function POST(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  try {
    const { storeId } = await context.params;

    if (!storeId) {
      console.error("[SUBSCRIPTION_RESUME_ERROR] Missing storeId");
      return new NextResponse("Store ID is required.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const authHeader = req.headers.get("authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[SUBSCRIPTION_RESUME_ERROR] Missing or invalid authorization header");
      return new NextResponse("Unauthorized - Missing or invalid authorization header", {
        status: 401,
        headers: corsHeaders,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    
    let userId: string;
    try {
      userId = await verifyCustomerToken(token);
      console.log("[SUBSCRIPTION_RESUME_INFO] Token verified successfully, userId:", userId);
    } catch (tokenError) {
      console.error("[SUBSCRIPTION_RESUME_ERROR] Token verification failed:", tokenError);
      return new NextResponse(
        tokenError instanceof Error ? `Token verification failed: ${tokenError.message}` : "Invalid or expired token",
        { 
          status: 401, 
          headers: corsHeaders 
        }
      );
    }

    if (!userId) {
      console.error("[SUBSCRIPTION_RESUME_ERROR] Token verification returned no userId");
      return new NextResponse("Invalid or expired token", {
        status: 401,
        headers: corsHeaders,
      });
    }

    const subscription = await getSubscriptionStatus(userId, storeId);

    if (!subscription) {
      return new NextResponse("No subscription found.", {
        status: 404,
        headers: corsHeaders,
      });
    }

    if (subscription.status === "CANCELED") {
      return new NextResponse("Cannot resume a canceled subscription. Please create a new subscription.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (!subscription.cancelAtPeriodEnd) {
      return NextResponse.json(
        {
          success: true,
          message: "Subscription is already active and not set to cancel.",
          cancelAtPeriodEnd: false,
        },
        { headers: corsHeaders }
      );
    }

    if (subscription.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: false,
        });
      } catch (stripeError) {
        // Continue with database update even if Stripe update fails
      }
    }

    const updatedSubscription = await prismadb.subscriptions.update({
      where: {
        id: subscription.id,
      },
      data: {
        cancelAtPeriodEnd: false,
      },
      select: {
        id: true,
        status: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Subscription has been resumed. Your subscription will continue to renew automatically.",
        subscription: {
          id: updatedSubscription.id,
          status: updatedSubscription.status,
          cancelAtPeriodEnd: updatedSubscription.cancelAtPeriodEnd,
          currentPeriodEnd: updatedSubscription.currentPeriodEnd
            ? new Date(updatedSubscription.currentPeriodEnd).toISOString()
            : null,
          updatedAt: new Date(updatedSubscription.updatedAt).toISOString(),
        },
      },
      { headers: corsHeaders }
    );
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