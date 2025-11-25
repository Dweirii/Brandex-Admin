import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { verifyCustomerTokenWithData } from "@/lib/verify-customer-token";
import prismadb from "@/lib/prismadb";
import Stripe from "stripe";

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
      return new NextResponse("Store ID is required.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const store = await prismadb.store.findUnique({
      where: { id: storeId },
      select: { id: true, name: true },
    });

    if (!store) {
      return new NextResponse("Store not found.", {
        status: 404,
        headers: corsHeaders,
      });
    }

    // Verify authentication FIRST before parsing body
    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return new NextResponse("Unauthorized - Missing or invalid authorization header", {
        status: 401,
        headers: corsHeaders,
      });
    }

    const token = authHeader.replace("Bearer ", "");

    // Verify token and extract trusted user data
    let userData;
    try {
      userData = await verifyCustomerTokenWithData(token);
    } catch (tokenError) {
      return new NextResponse(
        tokenError instanceof Error ? `Token verification failed: ${tokenError.message}` : "Invalid or expired token",
        {
          status: 401,
          headers: corsHeaders
        }
      );
    }

    if (!userData.userId) {
      return new NextResponse("Invalid or expired token", {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Extract email from verified token - this is the ONLY source of truth for user email
    const email = userData.email;
    if (!email || !email.includes("@")) {
      return new NextResponse(
        "User email not found in authentication token. Please ensure your account has a verified email address.",
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    // Now parse request body for priceId only
    let body;
    try {
      body = await req.json();
    } catch {
      return new NextResponse("Invalid JSON in request body", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { priceId } = body;

    if (!priceId || typeof priceId !== "string") {
      return new NextResponse("Price ID is required.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const monthlyPriceId = process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID;
    const yearlyPriceId = process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID;

    if (!monthlyPriceId || !yearlyPriceId) {
      return new NextResponse("Subscription pricing not configured.", {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (priceId !== monthlyPriceId && priceId !== yearlyPriceId) {
      return new NextResponse("Invalid price ID.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const userId = userData.userId;

    const existingSubscription = await prismadb.subscriptions.findUnique({
      where: {
        userId_storeId: {
          userId,
          storeId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (existingSubscription) {
      const activeStatuses = ["ACTIVE", "TRIALING"];
      if (activeStatuses.includes(existingSubscription.status)) {
        return new NextResponse("You already have an active subscription.", {
          status: 400,
          headers: corsHeaders,
        });
      }
    }

    // CRITICAL: Prevent multiple trials - check user's subscription history
    // This is the FIRST LINE OF DEFENSE against trial abuse
    const userSubscriptionRecord = await prismadb.subscriptions.findUnique({
      where: {
        userId_storeId: {
          userId,
          storeId,
        },
      },
      select: {
        id: true,
        userId: true,
        status: true,
        trialEnd: true,
        trialStart: true,
        createdAt: true,
        stripeSubscriptionId: true,
      },
    });

    // Multi-layer trial detection:
    // 1. Any existing subscription record = user has subscribed before
    // 2. If trialEnd or trialStart is set = user already used their trial
    // 3. If stripeSubscriptionId exists = there's an active/past Stripe subscription
    const hadSubscriptionBefore = !!userSubscriptionRecord;
    const hadTrialBefore = !!(userSubscriptionRecord?.trialEnd || userSubscriptionRecord?.trialStart);
    const userHadTrialBefore = hadSubscriptionBefore || hadTrialBefore;

    console.log("[SUBSCRIPTION_CHECKOUT_TRIAL_CHECK] Comprehensive trial eligibility check:", {
      userId,
      storeId,
      email,
      hadSubscriptionBefore,
      hadTrialBefore,
      userHadTrialBefore,
      existingRecord: userSubscriptionRecord ? {
        id: userSubscriptionRecord.id,
        status: userSubscriptionRecord.status,
        trialEnd: userSubscriptionRecord.trialEnd,
        trialStart: userSubscriptionRecord.trialStart,
        stripeSubscriptionId: userSubscriptionRecord.stripeSubscriptionId,
        createdAt: userSubscriptionRecord.createdAt,
      } : null,
    });

    const frontendUrl = process.env.FRONTEND_STORE_URL || "http://localhost:3000";

    // Determine trial eligibility: ONLY first-time users get trials
    const TRIAL_DAYS = 7;
    const isEligibleForTrial = !userHadTrialBefore;
    const trialDays = isEligibleForTrial ? TRIAL_DAYS : undefined;

    if (userHadTrialBefore) {
      console.log("[SUBSCRIPTION_CHECKOUT_TRIAL_CHECK] ❌ NO TRIAL - User ineligible:", {
        reason: hadTrialBefore ? "Previously used trial" : "Had subscription before",
        previousStatus: userSubscriptionRecord?.status,
        previousTrialEnd: userSubscriptionRecord?.trialEnd,
        previousStripeId: userSubscriptionRecord?.stripeSubscriptionId,
      });
    } else {
      console.log("[SUBSCRIPTION_CHECKOUT_TRIAL_CHECK] ✅ TRIAL ELIGIBLE - First-time user:", {
        trialDays: TRIAL_DAYS,
        willCharge: "after trial ends",
      });
    }

    // Build subscription_data with metadata for webhook verification
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: {
        userId,
        storeId,
        email,
        hadTrialBefore: userHadTrialBefore.toString(),
        isEligibleForTrial: isEligibleForTrial.toString(),
        checkoutTimestamp: new Date().toISOString(),
      },
    };

    if (isEligibleForTrial && trialDays) {
      subscriptionData.trial_period_days = trialDays;
      console.log("[SUBSCRIPTION_CHECKOUT_TRIAL_CHECK] ✅ Adding trial_period_days to Stripe session:", trialDays);
    } else {
      console.log("[SUBSCRIPTION_CHECKOUT_TRIAL_CHECK] NO trial_period_days - Immediate billing");
    }

    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    const timestampWindow = Math.floor(now / FIVE_MINUTES);
    const idempotencyKey = `checkout_${userId}_${storeId}_${priceId}_${timestampWindow}`;

    console.log("[SUBSCRIPTION_CHECKOUT_IDEMPOTENCY] Generated idempotency key:", {
      key: idempotencyKey,
      userId,
      storeId,
      priceId,
      timestampWindow,
      windowStart: new Date(timestampWindow * FIVE_MINUTES).toISOString(),
      windowEnd: new Date((timestampWindow + 1) * FIVE_MINUTES).toISOString(),
    });

    // Check for recent checkout session in the same window
    // This provides additional protection before even calling Stripe
    const recentCheckoutCutoff = new Date(Date.now() - FIVE_MINUTES);
    const recentSession = await prismadb.checkoutSession.findFirst({
      where: {
        userId,
        storeId,
        priceId,
        createdAt: {
          gte: recentCheckoutCutoff,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        stripeSessionId: true,
        stripeSessionUrl: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    if (recentSession) {
      const isExpired = recentSession.expiresAt && new Date(recentSession.expiresAt) < new Date();
      
      if (!isExpired && recentSession.stripeSessionUrl) {
        console.log("[SUBSCRIPTION_CHECKOUT_IDEMPOTENCY] ♻️ Reusing existing checkout session:", {
          sessionId: recentSession.stripeSessionId,
          createdAt: recentSession.createdAt,
          expiresAt: recentSession.expiresAt,
          reason: "Recent valid session found (prevents duplicate)",
        });

        return NextResponse.json(
          { 
            url: recentSession.stripeSessionUrl,
            reused: true,
            sessionId: recentSession.stripeSessionId,
          },
          { headers: corsHeaders }
        );
      } else if (isExpired) {
        console.log("[SUBSCRIPTION_CHECKOUT_IDEMPOTENCY] Previous session expired, creating new one:", {
          expiredSessionId: recentSession.stripeSessionId,
          expiredAt: recentSession.expiresAt,
        });
      }
    }

    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: email,
      subscription_data: subscriptionData,
      success_url: `${frontendUrl}?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}?canceled=true`,
      metadata: {
        userId,
        storeId,
        email,
        priceId,
        idempotencyKey,
        checkoutTimestamp: new Date().toISOString(),
      },
      allow_promotion_codes: true,
      billing_address_collection: "required",
      phone_number_collection: {
        enabled: true,
      },
    };

    const session = await stripe.checkout.sessions.create(
      sessionConfig,
      {
        idempotencyKey,
      }
    );

    console.log("[SUBSCRIPTION_CHECKOUT_IDEMPOTENCY] ✅ Created new Stripe checkout session:", {
      sessionId: session.id,
      url: session.url,
      expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      idempotencyKey,
    });

    try {
      await prismadb.checkoutSession.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          storeId,
          priceId,
          stripeSessionId: session.id,
          stripeSessionUrl: session.url || "",
          idempotencyKey,
          expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
          metadata: {
            email,
            hadTrialBefore: userHadTrialBefore,
            isEligibleForTrial: isEligibleForTrial,
          },
        },
      });

      console.log("[SUBSCRIPTION_CHECKOUT_IDEMPOTENCY] 💾 Saved session to database for deduplication");
    } catch (dbError) {
      console.error("[SUBSCRIPTION_CHECKOUT_ERROR] Failed to save session to database:", dbError);
      console.warn("[SUBSCRIPTION_CHECKOUT_WARNING] Session created in Stripe but not saved locally - idempotency may be affected");
    }

    return NextResponse.json(
      { 
        url: session.url,
        sessionId: session.id,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";

    return new NextResponse(
      JSON.stringify({
        error: errorMessage
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
}