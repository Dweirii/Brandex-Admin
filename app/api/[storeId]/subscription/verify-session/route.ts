import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { verifyCustomerToken } from "@/lib/verify-customer-token";
import { getSubscriptionStatus } from "@/lib/subscription";
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
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");

    if (!storeId) {
      return new NextResponse("Store ID is required.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (!sessionId) {
      return new NextResponse("Session ID is required.", {
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

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    // Check if session is completed and belongs to this user
    if (session.metadata?.userId !== userId || session.metadata?.storeId !== storeId) {
      return new NextResponse("Session does not belong to this user.", {
        status: 403,
        headers: corsHeaders,
      });
    }

    if (session.payment_status !== "paid" && session.status !== "complete") {
      return NextResponse.json(
        {
          verified: false,
          status: session.status,
          payment_status: session.payment_status,
        },
        { headers: corsHeaders }
      );
    }

    // Check if subscription exists in database
    let subscription = await getSubscriptionStatus(userId, storeId);

    // ALWAYS sync from Stripe if checkout session has a subscription and is paid
    // This handles the case where:
    // 1. User canceled subscription (DB shows CANCELED)
    // 2. User resubscribes (Stripe creates NEW subscription with ACTIVE status)
    // 3. Webhook might not have fired yet, so DB still shows CANCELED
    // We need to sync the NEW Stripe subscription status to DB
    if (session.subscription && session.payment_status === "paid") {
      try {
        const stripeSubscriptionId = typeof session.subscription === 'string' 
          ? session.subscription 
          : session.subscription.id;
        
        const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

        // Verify the subscription belongs to this user and store
        if (stripeSubscription.metadata?.userId === userId && stripeSubscription.metadata?.storeId === storeId) {
          console.log("[VERIFY_SESSION_INFO] Syncing subscription from Stripe:", {
            stripeSubscriptionId: stripeSubscription.id,
            stripeStatus: stripeSubscription.status,
            dbHasSubscription: !!subscription,
            dbStatus: subscription?.status,
            dbStripeId: subscription?.stripeSubscriptionId,
          });

          // Map Stripe status to our status
          let status: SubscriptionStatus = SubscriptionStatus.INCOMPLETE;
          if (stripeSubscription.status === "trialing") {
            status = SubscriptionStatus.TRIALING;
          } else if (stripeSubscription.status === "active") {
            status = SubscriptionStatus.ACTIVE;
          } else if (stripeSubscription.status === "past_due") {
            status = SubscriptionStatus.PAST_DUE;
          } else if (stripeSubscription.status === "unpaid") {
            status = SubscriptionStatus.UNPAID;
          } else if (stripeSubscription.status === "canceled") {
            status = SubscriptionStatus.CANCELED;
          }

          const subscriptionData = {
            userId,
            storeId,
            stripeSubscriptionId: stripeSubscription.id, // This will update to the NEW subscription ID
            stripeCustomerId: stripeSubscription.customer as string,
            status, // This will update to ACTIVE/TRIALING from CANCELED
            currentPeriodStart: stripeSubscription.current_period_start
              ? new Date(stripeSubscription.current_period_start * 1000)
              : null,
            currentPeriodEnd: stripeSubscription.current_period_end
              ? new Date(stripeSubscription.current_period_end * 1000)
              : null,
            cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end || false,
            trialStart: stripeSubscription.trial_start
              ? new Date(stripeSubscription.trial_start * 1000)
              : null,
            trialEnd: stripeSubscription.trial_end
              ? new Date(stripeSubscription.trial_end * 1000)
              : null,
          };

          const upsertedSub = await prismadb.subscriptions.upsert({
            where: {
              userId_storeId: {
                userId,
                storeId,
              },
            },
            create: {
              ...subscriptionData,
              id: crypto.randomUUID(),
              updatedAt: new Date(),
            },
            update: {
              ...subscriptionData,
              updatedAt: new Date(),
            },
          });

          console.log("[VERIFY_SESSION_INFO] ✅ Subscription synced from Stripe:", {
            id: upsertedSub.id,
            previousStatus: subscription?.status,
            newStatus: upsertedSub.status,
            previousStripeId: subscription?.stripeSubscriptionId,
            newStripeId: upsertedSub.stripeSubscriptionId,
            cancelAtPeriodEnd: upsertedSub.cancelAtPeriodEnd,
            wasUpdate: !!subscription,
          });

          // Re-fetch the subscription to ensure we have latest data
          subscription = await getSubscriptionStatus(userId, storeId);
          
          console.log("[VERIFY_SESSION_INFO] Re-fetched subscription after sync:", {
            hasSubscription: !!subscription,
            status: subscription?.status,
            stripeSubscriptionId: subscription?.stripeSubscriptionId,
            cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd,
          });

          // Verify the status was actually updated
          if (subscription && subscription.status === SubscriptionStatus.CANCELED && status !== SubscriptionStatus.CANCELED) {
            console.error("[VERIFY_SESSION_ERROR] ❌ Status still shows CANCELED after sync! Expected:", status);
          }
        }
      } catch (syncError) {
        console.error("[VERIFY_SESSION_ERROR] Failed to sync subscription from Stripe:", syncError);
        // Continue anyway - webhook will eventually sync it
      }
    }

    return NextResponse.json(
      {
        verified: true,
        hasSubscription: !!subscription,
        status: session.status,
        payment_status: session.payment_status,
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



