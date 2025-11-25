import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { verifyCustomerToken } from "@/lib/verify-customer-token";
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

    let body;
    try {
      body = await req.json();
    } catch {
      return new NextResponse("Invalid JSON in request body", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { priceId, email } = body;

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

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new NextResponse("Valid email is required.", {
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

    // CREATIVE SOLUTION: Check if user has EVER used a trial before
    // We look for ANY subscription record with a trialEnd date (meaning they HAD a trial at some point)
    // This works because:
    // 1. There's only ONE subscription record per userId+storeId (unique constraint)
    // 2. Once a trial is used, trialEnd is set and NEVER removed
    // 3. Even if they cancel and resubscribe, the same record is updated via upsert
    // 4. So we check: if trialEnd exists (even if null), they've subscribed before = no trial
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
      },
    });

    // Creative check: If they have a subscription record (regardless of status), they can't get trial
    // OR if trialEnd/trialStart was ever set, they already used their trial
    const userHadTrialBefore = !!userSubscriptionRecord;

    console.log("[SUBSCRIPTION_CHECKOUT_INFO] Checking user subscription history:", {
      userId,
      storeId,
      hadSubscriptionBefore: !!userSubscriptionRecord,
      lastStatus: userSubscriptionRecord?.status,
      lastTrialEnd: userSubscriptionRecord?.trialEnd,
      lastTrialStart: userSubscriptionRecord?.trialStart,
      userHadTrialBefore,
    });

    const frontendUrl = process.env.FRONTEND_STORE_URL || "http://localhost:3000";

    // If user has EVER had a subscription (even if canceled/ended), no trial
    const trialDays = userHadTrialBefore ? undefined : 7;

    console.log("[SUBSCRIPTION_CHECKOUT_INFO] User had subscription/trial before:", userHadTrialBefore);
    console.log("[SUBSCRIPTION_CHECKOUT_INFO] Trial days:", trialDays);

    if (userHadTrialBefore) {
      console.log("[SUBSCRIPTION_CHECKOUT_INFO] ❌ NO TRIAL - User previously had subscription with status:", userSubscriptionRecord?.status);
      console.log("[SUBSCRIPTION_CHECKOUT_INFO] Previous trial ended:", userSubscriptionRecord?.trialEnd);
    } else {
      console.log("[SUBSCRIPTION_CHECKOUT_INFO] ✅ FIRST TIME USER - Will get 7-day free trial");
    }

    // Build subscription_data - only include trial_period_days if user never had a subscription
    const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
      metadata: {
        userId,
        storeId,
        email,
        hadTrialBefore: userHadTrialBefore.toString(),
      },
    };

    // ONLY add trial_period_days if user never had a subscription before
    if (trialDays && !userHadTrialBefore) {
      subscriptionData.trial_period_days = trialDays;
      console.log("[SUBSCRIPTION_CHECKOUT_INFO] ✅ Adding trial period:", trialDays, "days");
    } else {
      console.log("[SUBSCRIPTION_CHECKOUT_INFO] ❌ NO TRIAL - User had subscription before, charging immediately");
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
      },
      allow_promotion_codes: true,
      billing_address_collection: "required",
      phone_number_collection: {
        enabled: true,
      },
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return NextResponse.json(
      { url: session.url },
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