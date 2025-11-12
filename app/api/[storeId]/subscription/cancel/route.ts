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

export async function POST(
  req: Request,
  context: { params: Promise<{ storeId: string }> }
) {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  try {
    const { storeId } = await context.params;

    if (!storeId) {
      console.error("[SUBSCRIPTION_CANCEL_ERROR] Missing storeId");
      return new NextResponse("Store ID is required.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const authHeader = req.headers.get("authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[SUBSCRIPTION_CANCEL_ERROR] Missing or invalid authorization header");
      return new NextResponse("Unauthorized - Missing or invalid authorization header", {
        status: 401,
        headers: corsHeaders,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    
    let userId: string;
    try {
      userId = await verifyCustomerToken(token);
      console.log("[SUBSCRIPTION_CANCEL_INFO] Token verified successfully, userId:", userId);
    } catch (tokenError) {
      console.error("[SUBSCRIPTION_CANCEL_ERROR] Token verification failed:", tokenError);
      return new NextResponse(
        tokenError instanceof Error ? `Token verification failed: ${tokenError.message}` : "Invalid or expired token",
        { 
          status: 401, 
          headers: corsHeaders 
        }
      );
    }

    if (!userId) {
      console.error("[SUBSCRIPTION_CANCEL_ERROR] Token verification returned no userId");
      return new NextResponse("Invalid or expired token", {
        status: 401,
        headers: corsHeaders,
      });
    }

    const subscription = await getSubscriptionStatus(userId, storeId);

    if (!subscription) {
      console.error("[SUBSCRIPTION_CANCEL_ERROR] No subscription found", { userId, storeId });
      return new NextResponse("No active subscription found.", {
        status: 404,
        headers: corsHeaders,
      });
    }

    if (subscription.cancelAtPeriodEnd) {
      console.log("[SUBSCRIPTION_CANCEL_INFO] Subscription already set to cancel at period end", {
        userId,
        storeId,
        subscriptionId: subscription.id,
      });
      return NextResponse.json(
        {
          success: true,
          message: "Subscription is already set to cancel at the end of the current period.",
          cancelAtPeriodEnd: true,
          currentPeriodEnd: subscription.currentPeriodEnd
            ? new Date(subscription.currentPeriodEnd).toISOString()
            : null,
        },
        { headers: corsHeaders }
      );
    }

    if (subscription.status === "CANCELED") {
      console.log("[SUBSCRIPTION_CANCEL_INFO] Subscription already canceled", {
        userId,
        storeId,
        subscriptionId: subscription.id,
      });
      return NextResponse.json(
        {
          success: true,
          message: "Subscription is already canceled.",
          status: "CANCELED",
        },
        { headers: corsHeaders }
      );
    }

    if (subscription.stripeSubscriptionId) {
      try {
        console.log("[SUBSCRIPTION_CANCEL_INFO] Updating Stripe subscription", {
          stripeSubscriptionId: subscription.stripeSubscriptionId,
        });

        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });

        console.log("[SUBSCRIPTION_CANCEL_INFO] Stripe subscription updated successfully");
      } catch (stripeError) {
        console.error("[SUBSCRIPTION_CANCEL_ERROR] Failed to update Stripe subscription:", stripeError);
        
        if (stripeError instanceof Error) {
          console.warn("[SUBSCRIPTION_CANCEL_WARNING] Continuing with database update despite Stripe error:", stripeError.message);
        }
      }
    } else {
      console.warn("[SUBSCRIPTION_CANCEL_WARNING] No Stripe subscription ID found, updating database only", {
        subscriptionId: subscription.id,
      });
    }

    const updatedSubscription = await prismadb.subscriptions.update({
      where: {
        id: subscription.id,
      },
      data: {
        cancelAtPeriodEnd: true,
      },
      select: {
        id: true,
        status: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
        updatedAt: true,
      },
    });

    console.log("[SUBSCRIPTION_CANCEL_INFO] Subscription canceled successfully", {
      userId,
      storeId,
      subscriptionId: updatedSubscription.id,
      currentPeriodEnd: updatedSubscription.currentPeriodEnd,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Subscription will be canceled at the end of the current billing period. You will continue to have access until then.",
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
    console.error("[SUBSCRIPTION_CANCEL_ERROR] Unexpected error:", error);
    return new NextResponse(
      error instanceof Error ? error.message : "Internal Server Error",
      { 
        status: 500, 
        headers: corsHeaders 
      }
    );
  }
}