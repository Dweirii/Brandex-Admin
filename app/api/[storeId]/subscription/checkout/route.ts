import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { verifyCustomerToken } from "@/lib/verify-customer-token";
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
      console.error("[SUBSCRIPTION_CHECKOUT_ERROR] Missing storeId");
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
      console.error("[SUBSCRIPTION_CHECKOUT_ERROR] Store not found", { storeId });
      return new NextResponse("Store not found.", {
        status: 404,
        headers: corsHeaders,
      });
    }

    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("[SUBSCRIPTION_CHECKOUT_ERROR] Failed to parse request body:", parseError);
      return new NextResponse("Invalid JSON in request body", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const { priceId, email } = body;

    if (!priceId || typeof priceId !== "string") {
      console.error("[SUBSCRIPTION_CHECKOUT_ERROR] Missing or invalid priceId");
      return new NextResponse("Price ID is required.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const monthlyPriceId = process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID;
    const yearlyPriceId = process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID;

    if (!monthlyPriceId || !yearlyPriceId) {
      console.error("[SUBSCRIPTION_CHECKOUT_ERROR] Stripe price IDs not configured");
      return new NextResponse("Subscription pricing not configured.", {
        status: 500,
        headers: corsHeaders,
      });
    }

    if (priceId !== monthlyPriceId && priceId !== yearlyPriceId) {
      console.error("[SUBSCRIPTION_CHECKOUT_ERROR] Invalid price ID", { priceId });
      return new NextResponse("Invalid price ID.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (!email || typeof email !== "string" || !email.includes("@")) {
      console.error("[SUBSCRIPTION_CHECKOUT_ERROR] Missing or invalid email");
      return new NextResponse("Valid email is required.", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const authHeader = req.headers.get("authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[SUBSCRIPTION_CHECKOUT_ERROR] Missing or invalid authorization header");
      return new NextResponse("Unauthorized - Missing or invalid authorization header", {
        status: 401,
        headers: corsHeaders,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    
    let userId: string;
    try {
      userId = await verifyCustomerToken(token);
      console.log("[SUBSCRIPTION_CHECKOUT_INFO] Token verified successfully, userId:", userId);
    } catch (tokenError) {
      console.error("[SUBSCRIPTION_CHECKOUT_ERROR] Token verification failed:", tokenError);
      return new NextResponse(
        tokenError instanceof Error ? `Token verification failed: ${tokenError.message}` : "Invalid or expired token",
        { 
          status: 401, 
          headers: corsHeaders 
        }
      );
    }

    if (!userId) {
      console.error("[SUBSCRIPTION_CHECKOUT_ERROR] Token verification returned no userId");
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
        console.log("[SUBSCRIPTION_CHECKOUT_INFO] User already has active subscription", {
          userId,
          storeId,
          subscriptionId: existingSubscription.id,
        });
        return new NextResponse("You already have an active subscription.", {
          status: 400,
          headers: corsHeaders,
        });
      }
    }

    const frontendUrl = process.env.FRONTEND_STORE_URL || "http://localhost:3000";

    console.log("[SUBSCRIPTION_CHECKOUT_INFO] Creating Stripe checkout session", {
      userId,
      storeId,
      priceId,
      email,
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: email,
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          userId,
          storeId,
          email,
        },
      },
      success_url: `${frontendUrl}/premium?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/premium?canceled=true`,
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
    });

    console.log("[SUBSCRIPTION_CHECKOUT_INFO] Stripe session created successfully", {
      sessionId: session.id,
      url: session.url,
      userId,
      storeId,
    });

    return NextResponse.json(
      { url: session.url },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("[SUBSCRIPTION_CHECKOUT_ERROR] Unexpected error:", error);
    return new NextResponse(
      error instanceof Error ? error.message : "Internal Server Error",
      { 
        status: 500, 
        headers: corsHeaders 
      }
    );
  }
}