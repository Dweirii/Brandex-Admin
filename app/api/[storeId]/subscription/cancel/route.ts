import { NextResponse } from "next/server";
import { verifyCustomerToken } from "@/lib/verify-customer-token";
import { getSubscriptionStatus } from "@/lib/subscription";
import { stripe } from "@/lib/stripe";
import prismadb from "@/lib/prismadb";
import { SubscriptionStatus } from "@prisma/client";

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
    "Content-Type": "application/json",
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
      return NextResponse.json(
        {
          success: false,
          message: "Store ID is required.",
        },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    const authHeader = req.headers.get("authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[SUBSCRIPTION_CANCEL_ERROR] Missing or invalid authorization header");
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized - Missing or invalid authorization header",
        },
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    
    let userId: string;
    try {
      userId = await verifyCustomerToken(token);
      console.log("[SUBSCRIPTION_CANCEL_INFO] Token verified successfully, userId:", userId);
    } catch (tokenError) {
      console.error("[SUBSCRIPTION_CANCEL_ERROR] Token verification failed:", tokenError);
      return NextResponse.json(
        {
          success: false,
          message: tokenError instanceof Error ? `Token verification failed: ${tokenError.message}` : "Invalid or expired token",
        },
        { 
          status: 401, 
          headers: corsHeaders 
        }
      );
    }

    if (!userId) {
      console.error("[SUBSCRIPTION_CANCEL_ERROR] Token verification returned no userId");
      return NextResponse.json(
        {
          success: false,
          message: "Invalid or expired token",
        },
        {
          status: 401,
          headers: corsHeaders,
        }
      );
    }

    const subscription = await getSubscriptionStatus(userId, storeId);

    if (!subscription) {
      return NextResponse.json(
        {
          success: false,
          message: "No active subscription found.",
        },
        {
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    if (subscription.status === "CANCELED") {
      return NextResponse.json(
        {
          success: true,
          message: "Subscription is already canceled.",
          status: "CANCELED",
        },
        { headers: corsHeaders }
      );
    }

    // Check if subscription is in trial period
    const isInTrial = subscription.status === "TRIALING" && subscription.trialEnd && new Date(subscription.trialEnd) > new Date();
    
    console.log("[SUBSCRIPTION_CANCEL_INFO] Subscription details:", {
      status: subscription.status,
      isInTrial,
      trialEnd: subscription.trialEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    });

    // If in trial period, cancel immediately
    // If in paid period, cancel at period end
    if (isInTrial) {
      // Cancel immediately during trial
      if (subscription.stripeSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
          console.log("[SUBSCRIPTION_CANCEL_INFO] Stripe subscription canceled immediately (trial)");
        } catch (stripeError) {
          console.error("[SUBSCRIPTION_CANCEL_ERROR] Stripe cancel failed:", stripeError);
          // Continue with database update even if Stripe update fails
        }
      }

      const updatedSubscription = await prismadb.subscriptions.update({
        where: {
          id: subscription.id,
        },
        data: {
          status: SubscriptionStatus.CANCELED,
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

      console.log("[SUBSCRIPTION_CANCEL_INFO] Database updated to CANCELED (trial):", {
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        cancelAtPeriodEnd: updatedSubscription.cancelAtPeriodEnd,
      });

      // Verify the update
      const verifySubscription = await prismadb.subscriptions.findUnique({
        where: { id: subscription.id },
        select: { status: true, cancelAtPeriodEnd: true },
      });

      if (!verifySubscription || verifySubscription.status !== SubscriptionStatus.CANCELED) {
        console.error("[SUBSCRIPTION_CANCEL_ERROR] Database update verification failed!");
        throw new Error("Failed to update subscription in database");
      }

      return NextResponse.json(
        {
          success: true,
          message: "Trial subscription has been canceled. Access has been removed immediately.",
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
    }

    // Not in trial - cancel at period end
    if (subscription.cancelAtPeriodEnd) {
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

    if (subscription.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
        console.log("[SUBSCRIPTION_CANCEL_INFO] Stripe subscription set to cancel at period end");
      } catch (stripeError) {
        console.error("[SUBSCRIPTION_CANCEL_ERROR] Stripe update failed:", stripeError);
        // Continue with database update even if Stripe update fails
      }
    } else {
      console.warn("[SUBSCRIPTION_CANCEL_WARNING] No stripeSubscriptionId found, updating database only");
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

    console.log("[SUBSCRIPTION_CANCEL_INFO] Database updated successfully:", {
      id: updatedSubscription.id,
      cancelAtPeriodEnd: updatedSubscription.cancelAtPeriodEnd,
      status: updatedSubscription.status,
    });

    // Verify the update
    const verifySubscription = await prismadb.subscriptions.findUnique({
      where: { id: subscription.id },
      select: { cancelAtPeriodEnd: true },
    });

    if (!verifySubscription || !verifySubscription.cancelAtPeriodEnd) {
      console.error("[SUBSCRIPTION_CANCEL_ERROR] Database update verification failed!");
      throw new Error("Failed to update subscription in database");
    }

    console.log("[SUBSCRIPTION_CANCEL_INFO] Update verified successfully");

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
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Internal Server Error",
      },
      { 
        status: 500, 
        headers: corsHeaders 
      }
    );
  }
}