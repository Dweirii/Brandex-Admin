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
      // Cancel immediately during trial - MUST succeed in Stripe first
      if (!subscription.stripeSubscriptionId) {
        console.error("[SUBSCRIPTION_CANCEL_ERROR] Missing Stripe subscription ID for trial cancellation");
        return NextResponse.json(
          {
            success: false,
            message: "Unable to cancel subscription: Missing payment provider information. Please contact support.",
          },
          {
            status: 500,
            headers: corsHeaders,
          }
        );
      }

      // Attempt Stripe cancellation with retry logic
      let stripeCancelSucceeded = false;
      let stripeError: Error | null = null;
      const MAX_RETRIES = 3;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await stripe.subscriptions.cancel(subscription.stripeSubscriptionId);
          console.log("[SUBSCRIPTION_CANCEL_INFO] Stripe subscription canceled immediately (trial), attempt:", attempt);
          stripeCancelSucceeded = true;
          break;
        } catch (error) {
          stripeError = error instanceof Error ? error : new Error("Unknown Stripe error");
          console.error(`[SUBSCRIPTION_CANCEL_ERROR] Stripe cancel failed (attempt ${attempt}/${MAX_RETRIES}):`, stripeError);
          
          // Wait before retry (exponential backoff: 500ms, 1s, 2s)
          if (attempt < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
          }
        }
      }

      // If Stripe cancellation failed after retries, fail the request
      if (!stripeCancelSucceeded) {
        console.error("[SUBSCRIPTION_CANCEL_ERROR] Stripe cancellation failed after all retries");
        return NextResponse.json(
          {
            success: false,
            message: "Unable to cancel subscription with payment provider. Please try again later or contact support.",
            error: stripeError?.message || "Payment provider error",
          },
          {
            status: 502, // Bad Gateway - external service failure
            headers: corsHeaders,
          }
        );
      }

      // Only update database AFTER Stripe confirms cancellation
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

    // Update Stripe first, then database
    if (!subscription.stripeSubscriptionId) {
      console.error("[SUBSCRIPTION_CANCEL_ERROR] Missing Stripe subscription ID");
      return NextResponse.json(
        {
          success: false,
          message: "Unable to cancel subscription: Missing payment provider information. Please contact support.",
        },
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    // Attempt Stripe update with retry logic
    let stripeUpdateSucceeded = false;
    let stripeError: Error | null = null;
    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
        console.log(`[SUBSCRIPTION_CANCEL_INFO] Stripe subscription set to cancel at period end (attempt ${attempt})`);
        stripeUpdateSucceeded = true;
        break;
      } catch (error) {
        stripeError = error instanceof Error ? error : new Error("Unknown Stripe error");
        console.error(`[SUBSCRIPTION_CANCEL_ERROR] Stripe update failed (attempt ${attempt}/${MAX_RETRIES}):`, stripeError);
        
        // Wait before retry (exponential backoff: 500ms, 1s, 2s)
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt - 1)));
        }
      }
    }

    // If Stripe update failed after retries, fail the request
    if (!stripeUpdateSucceeded) {
      console.error("[SUBSCRIPTION_CANCEL_ERROR] Stripe update failed after all retries");
      return NextResponse.json(
        {
          success: false,
          message: "Unable to cancel subscription with payment provider. Please try again later or contact support.",
          error: stripeError?.message || "Payment provider error",
        },
        {
          status: 502, // Bad Gateway - external service failure
          headers: corsHeaders,
        }
      );
    }

    // Only update database AFTER Stripe confirms the change
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