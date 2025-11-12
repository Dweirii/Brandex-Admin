import Stripe from "stripe";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import prismadb from "@/lib/prismadb";
import { SubscriptionStatus } from "@prisma/client";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature") as string;

  if (!signature) {
    console.error("[SUBSCRIPTION_WEBHOOK_ERROR] Missing stripe-signature header");
    return new NextResponse("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    console.error("[SUBSCRIPTION_WEBHOOK_ERROR] Webhook signature verification failed:", error);
    return new NextResponse(
      `Webhook Error: ${error instanceof Error ? error.message : "Invalid signature"}`,
      { status: 400 }
    );
  }

  console.log("[SUBSCRIPTION_WEBHOOK_INFO] Received event:", event.type);

  try {
    switch (event.type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(event.data.object as Stripe.Subscription);
        break;

      default:
        console.log("[SUBSCRIPTION_WEBHOOK_INFO] Unhandled event type:", event.type);
    }

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error("[SUBSCRIPTION_WEBHOOK_ERROR] Error processing webhook:", error);
    return new NextResponse(
      `Webhook processing error: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500 }
    );
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  const storeId = subscription.metadata?.storeId;

  if (!userId || !storeId) {
    console.error("[SUBSCRIPTION_WEBHOOK_ERROR] Missing userId or storeId in subscription metadata", {
      subscriptionId: subscription.id,
      metadata: subscription.metadata,
    });
    return;
  }

  let status: SubscriptionStatus = SubscriptionStatus.INCOMPLETE;
  if (subscription.status === "trialing") {
    status = SubscriptionStatus.TRIALING;
  } else if (subscription.status === "active") {
    status = SubscriptionStatus.ACTIVE;
  } else if (subscription.status === "past_due") {
    status = SubscriptionStatus.PAST_DUE;
  } else if (subscription.status === "unpaid") {
    status = SubscriptionStatus.UNPAID;
  } else if (subscription.status === "canceled") {
    status = SubscriptionStatus.CANCELED;
  }

  const subscriptionData = {
    userId,
    storeId,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customer as string,
    status,
    currentPeriodStart: subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000)
      : null,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    trialStart: subscription.trial_start
      ? new Date(subscription.trial_start * 1000)
      : null,
    trialEnd: subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null,
  };

  try {
    const createdSubscription = await prismadb.subscriptions.upsert({
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
      update: subscriptionData,
    });

    console.log("[SUBSCRIPTION_WEBHOOK_INFO] Subscription created/updated", {
      subscriptionId: createdSubscription.id,
      stripeSubscriptionId: subscription.id,
      userId,
      storeId,
      status,
    });
  } catch (error) {
    console.error("[SUBSCRIPTION_WEBHOOK_ERROR] Failed to create subscription record:", error);
    throw error;
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const stripeSubscriptionId = subscription.id;

  const existingSubscription = await prismadb.subscriptions.findUnique({
    where: {
      stripeSubscriptionId,
    },
  });

  if (!existingSubscription) {
    console.warn("[SUBSCRIPTION_WEBHOOK_WARNING] Subscription not found for update", {
      stripeSubscriptionId,
    });
    if (subscription.metadata?.userId && subscription.metadata?.storeId) {
      await handleSubscriptionCreated(subscription);
    }
    return;
  }

  let status: SubscriptionStatus = SubscriptionStatus.INCOMPLETE;
  if (subscription.status === "trialing") {
    status = SubscriptionStatus.TRIALING;
  } else if (subscription.status === "active") {
    status = SubscriptionStatus.ACTIVE;
  } else if (subscription.status === "past_due") {
    status = SubscriptionStatus.PAST_DUE;
  } else if (subscription.status === "unpaid") {
    status = SubscriptionStatus.UNPAID;
  } else if (subscription.status === "canceled") {
    status = SubscriptionStatus.CANCELED;
  }

  const updateData = {
    status,
    currentPeriodStart: subscription.current_period_start
      ? new Date(subscription.current_period_start * 1000)
      : null,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
    trialStart: subscription.trial_start
      ? new Date(subscription.trial_start * 1000)
      : null,
    trialEnd: subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null,
    stripeCustomerId: subscription.customer as string,
  };

  try {
    const updatedSubscription = await prismadb.subscriptions.update({
      where: {
        id: existingSubscription.id,
      },
      data: updateData,
    });

    console.log("[SUBSCRIPTION_WEBHOOK_INFO] Subscription updated", {
      subscriptionId: updatedSubscription.id,
      stripeSubscriptionId,
      status,
      cancelAtPeriodEnd: updatedSubscription.cancelAtPeriodEnd,
    });
  } catch (error) {
    console.error("[SUBSCRIPTION_WEBHOOK_ERROR] Failed to update subscription:", error);
    throw error;
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const stripeSubscriptionId = subscription.id;

  try {
    const updatedSubscription = await prismadb.subscriptions.updateMany({
      where: {
        stripeSubscriptionId,
      },
      data: {
        status: SubscriptionStatus.CANCELED,
        cancelAtPeriodEnd: false,
      },
    });

    if (updatedSubscription.count === 0) {
      console.warn("[SUBSCRIPTION_WEBHOOK_WARNING] Subscription not found for deletion", {
        stripeSubscriptionId,
      });
    } else {
      console.log("[SUBSCRIPTION_WEBHOOK_INFO] Subscription marked as canceled", {
        stripeSubscriptionId,
        count: updatedSubscription.count,
      });
    }
  } catch (error) {
    console.error("[SUBSCRIPTION_WEBHOOK_ERROR] Failed to mark subscription as canceled:", error);
    throw error;
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string | null;

  if (!subscriptionId) {
    console.log("[SUBSCRIPTION_WEBHOOK_INFO] Invoice has no subscription, skipping");
    return;
  }

  try {
    const subscription = await prismadb.subscriptions.findUnique({
      where: {
        stripeSubscriptionId: subscriptionId,
      },
    });

    if (!subscription) {
      console.warn("[SUBSCRIPTION_WEBHOOK_WARNING] Subscription not found for invoice payment", {
        subscriptionId,
      });
      return;
    }

    if (subscription.status !== SubscriptionStatus.ACTIVE && subscription.status !== SubscriptionStatus.TRIALING) {
      const updatedSubscription = await prismadb.subscriptions.update({
        where: {
          id: subscription.id,
        },
        data: {
          status: SubscriptionStatus.ACTIVE,
        },
      });

      console.log("[SUBSCRIPTION_WEBHOOK_INFO] Subscription activated after payment", {
        subscriptionId: updatedSubscription.id,
        stripeSubscriptionId: subscriptionId,
      });
    } else {
      console.log("[SUBSCRIPTION_WEBHOOK_INFO] Subscription already active, no update needed", {
        subscriptionId: subscription.id,
      });
    }
  } catch (error) {
    console.error("[SUBSCRIPTION_WEBHOOK_ERROR] Failed to update subscription after payment:", error);
    throw error;
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string | null;

  if (!subscriptionId) {
    console.log("[SUBSCRIPTION_WEBHOOK_INFO] Invoice has no subscription, skipping");
    return;
  }

  try {
    const subscription = await prismadb.subscriptions.findUnique({
      where: {
        stripeSubscriptionId: subscriptionId,
      },
    });

    if (!subscription) {
      console.warn("[SUBSCRIPTION_WEBHOOK_WARNING] Subscription not found for failed payment", {
        subscriptionId,
      });
      return;
    }

    const updatedSubscription = await prismadb.subscriptions.update({
      where: {
        id: subscription.id,
      },
      data: {
        status: SubscriptionStatus.PAST_DUE,
      },
    });

    console.log("[SUBSCRIPTION_WEBHOOK_INFO] Subscription marked as past due", {
      subscriptionId: updatedSubscription.id,
      stripeSubscriptionId: subscriptionId,
    });
  } catch (error) {
    console.error("[SUBSCRIPTION_WEBHOOK_ERROR] Failed to update subscription after failed payment:", error);
    throw error;
  }
}

async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  const stripeSubscriptionId = subscription.id;

  try {
    const dbSubscription = await prismadb.subscriptions.findUnique({
      where: {
        stripeSubscriptionId,
      },
      include: {
        Store: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!dbSubscription) {
      console.warn("[SUBSCRIPTION_WEBHOOK_WARNING] Subscription not found for trial end reminder", {
        stripeSubscriptionId,
      });
      return;
    }

    // TODO: Send reminder email to user about trial ending
    console.log("[SUBSCRIPTION_WEBHOOK_INFO] Trial ending soon - reminder notification", {
      subscriptionId: dbSubscription.id,
      userId: dbSubscription.userId,
      trialEnd: dbSubscription.trialEnd,
      storeName: dbSubscription.Store?.name,
    });
  } catch (error) {
    console.error("[SUBSCRIPTION_WEBHOOK_ERROR] Failed to handle trial end reminder:", error);

  }
}

