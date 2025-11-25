import Stripe from "stripe";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import prismadb from "@/lib/prismadb";
import { SubscriptionStatus } from "@prisma/client";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature") as string;

  if (!signature) {
    return new NextResponse("Missing signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET!
    );
  } catch (error) {
    return new NextResponse(
      `Webhook Error: ${error instanceof Error ? error.message : "Invalid signature"}`,
      { status: 400 }
    );
  }

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
        // Unhandled event type
        break;
    }

    return new NextResponse(null, { status: 200 });
  } catch (error) {
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
    return;
  }

  // CRITICAL: Detect and prevent unauthorized trials (SECOND LINE OF DEFENSE)
  // This catches cases where checkout was bypassed or Stripe was accessed directly
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
      trialEnd: true,
      trialStart: true,
      stripeSubscriptionId: true,
      createdAt: true,
    },
  });

  // Check metadata from checkout for trial eligibility verification
  const metadataEligibleForTrial = subscription.metadata?.isEligibleForTrial === "true";
  const metadataHadTrialBefore = subscription.metadata?.hadTrialBefore === "true";

  // Detect UNAUTHORIZED trial: Stripe subscription has trial but user isn't eligible
  const hasUnauthorizedTrial = 
    subscription.trial_end && // Stripe subscription has a trial
    existingSubscription && // User has previous subscription record
    (
      existingSubscription.stripeSubscriptionId !== subscription.id || // Different subscription
      existingSubscription.trialEnd !== null || // Previously used trial
      existingSubscription.trialStart !== null || // Previously used trial
      metadataHadTrialBefore // Metadata confirms they had trial before
    );

  if (hasUnauthorizedTrial) {
    console.error("[SUBSCRIPTION_WEBHOOK_TRIAL_VIOLATION] 🚨 UNAUTHORIZED TRIAL DETECTED!", {
      userId,
      storeId,
      violation: "User receiving trial but not eligible",
      newSubscription: {
        id: subscription.id,
        status: subscription.status,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      },
      existingRecord: {
        id: existingSubscription.id,
        status: existingSubscription.status,
        trialEnd: existingSubscription.trialEnd,
        trialStart: existingSubscription.trialStart,
        stripeSubscriptionId: existingSubscription.stripeSubscriptionId,
        createdAt: existingSubscription.createdAt,
      },
      metadata: {
        isEligibleForTrial: metadataEligibleForTrial,
        hadTrialBefore: metadataHadTrialBefore,
      },
    });

    // ACTIVE ENFORCEMENT: Remove the trial immediately via Stripe API
    try {
      console.log("[SUBSCRIPTION_WEBHOOK_TRIAL_VIOLATION] Attempting to remove unauthorized trial via Stripe API...");
      
      // Update the subscription to remove trial and start billing immediately
      const updatedStripeSubscription = await stripe.subscriptions.update(subscription.id, {
        trial_end: "now", // End trial immediately
        metadata: {
          ...subscription.metadata,
          trialRemovedReason: "User not eligible for trial - previous subscription detected",
          trialRemovedAt: new Date().toISOString(),
        },
      });

      console.log("[SUBSCRIPTION_WEBHOOK_TRIAL_VIOLATION] ✅ Successfully removed unauthorized trial:", {
        subscriptionId: subscription.id,
        previousTrialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        newStatus: updatedStripeSubscription.status,
        newTrialEnd: updatedStripeSubscription.trial_end ? new Date(updatedStripeSubscription.trial_end * 1000) : null,
      });

      // Update local subscription reference to use the corrected data
      subscription.trial_end = updatedStripeSubscription.trial_end;
      subscription.trial_start = updatedStripeSubscription.trial_start;
      subscription.status = updatedStripeSubscription.status;

    } catch (stripeError) {
      console.error("[SUBSCRIPTION_WEBHOOK_TRIAL_VIOLATION] ❌ Failed to remove trial via Stripe:", stripeError);
      
      // If we can't fix it in Stripe, at least don't save the trial in our database
      // This is a last-resort safeguard
      console.warn("[SUBSCRIPTION_WEBHOOK_TRIAL_VIOLATION] Will save subscription without trial data in database");
    }
  } else if (subscription.trial_end && existingSubscription) {
    // Trial exists but it might be legitimate (same subscription being updated)
    console.log("[SUBSCRIPTION_WEBHOOK_TRIAL_CHECK] Trial detected, verifying legitimacy:", {
      userId,
      storeId,
      isSameSubscription: existingSubscription.stripeSubscriptionId === subscription.id,
      hadPreviousTrial: !!(existingSubscription.trialEnd || existingSubscription.trialStart),
      metadataEligibleForTrial,
    });
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

  // FINAL SAFEGUARD: Don't save trial data for users who already had a trial
  // This prevents database pollution even if Stripe update failed
  const shouldStoreTrialData = !existingSubscription || 
    (!existingSubscription.trialEnd && !existingSubscription.trialStart);

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
    // Only store trial data if user is eligible (never had trial before)
    trialStart: (shouldStoreTrialData && subscription.trial_start)
      ? new Date(subscription.trial_start * 1000)
      : null,
    trialEnd: (shouldStoreTrialData && subscription.trial_end)
      ? new Date(subscription.trial_end * 1000)
      : null,
  };

  if (!shouldStoreTrialData && (subscription.trial_start || subscription.trial_end)) {
    console.warn("[SUBSCRIPTION_WEBHOOK_TRIAL_SAFEGUARD] 🛡️ Refusing to store trial data for repeat user:", {
      userId,
      storeId,
      stripeTrialStart: subscription.trial_start,
      stripeTrialEnd: subscription.trial_end,
      existingTrialStart: existingSubscription?.trialStart,
      existingTrialEnd: existingSubscription?.trialEnd,
      reason: "User already had trial - preventing database pollution",
    });
  }

  try {
    console.log("[SUBSCRIPTION_WEBHOOK_INFO] Processing subscription.created:", {
      userId,
      storeId,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      hasTrial: !!subscription.trial_end,
      hadPreviousSubscription: !!existingSubscription,
      previousStatus: existingSubscription?.status,
      previousStripeId: existingSubscription?.stripeSubscriptionId,
    });

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
      update: {
        ...subscriptionData,
        updatedAt: new Date(), // Force update timestamp
      },
    });

    console.log("[SUBSCRIPTION_WEBHOOK_INFO] ✅ Subscription upserted successfully:", {
      dbId: createdSubscription.id,
      dbStatus: createdSubscription.status,
      dbStripeSubscriptionId: createdSubscription.stripeSubscriptionId,
      dbCancelAtPeriodEnd: createdSubscription.cancelAtPeriodEnd,
      wasUpdate: !!existingSubscription,
      previousStatus: existingSubscription?.status,
      newStatus: status,
    });

    // Verify the update actually happened
    const verifyUpdated = await prismadb.subscriptions.findUnique({
      where: {
        userId_storeId: {
          userId,
          storeId,
        },
      },
      select: {
        status: true,
        stripeSubscriptionId: true,
        cancelAtPeriodEnd: true,
      },
    });

    console.log("[SUBSCRIPTION_WEBHOOK_INFO] Verified database state:", {
      status: verifyUpdated?.status,
      stripeSubscriptionId: verifyUpdated?.stripeSubscriptionId,
      cancelAtPeriodEnd: verifyUpdated?.cancelAtPeriodEnd,
      expectedStatus: status,
      expectedStripeId: subscription.id,
      statusMatches: verifyUpdated?.status === status,
      stripeIdMatches: verifyUpdated?.stripeSubscriptionId === subscription.id,
    });

    if (verifyUpdated?.status !== status) {
      console.error("[SUBSCRIPTION_WEBHOOK_ERROR] ❌ Status mismatch after upsert!", {
        expected: status,
        actual: verifyUpdated?.status,
      });
    }

    if (verifyUpdated?.stripeSubscriptionId !== subscription.id) {
      console.error("[SUBSCRIPTION_WEBHOOK_ERROR] ❌ Stripe ID mismatch after upsert!", {
        expected: subscription.id,
        actual: verifyUpdated?.stripeSubscriptionId,
      });
    }
  } catch (error) {
    console.error("[SUBSCRIPTION_WEBHOOK_ERROR] Failed to create/update subscription:", error);
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

    console.log("[SUBSCRIPTION_WEBHOOK_INFO] Subscription updated:", {
      id: updatedSubscription.id,
      status: updateData.status,
      cancelAtPeriodEnd: updateData.cancelAtPeriodEnd,
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

    console.log("[SUBSCRIPTION_WEBHOOK_INFO] Subscription deleted/canceled:", {
      stripeSubscriptionId,
      updated: updatedSubscription.count,
    });
  } catch (error) {
    console.error("[SUBSCRIPTION_WEBHOOK_ERROR] Failed to handle subscription deletion:", error);
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
      return;
    }

    if (subscription.status !== SubscriptionStatus.ACTIVE && subscription.status !== SubscriptionStatus.TRIALING) {
      await prismadb.subscriptions.update({
        where: {
          id: subscription.id,
        },
        data: {
          status: SubscriptionStatus.ACTIVE,
        },
      });
    }
  } catch (error) {
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
      return;
    }

    await prismadb.subscriptions.update({
      where: {
        id: subscription.id,
      },
      data: {
        status: SubscriptionStatus.PAST_DUE,
      },
    });
  } catch (error) {
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
      return;
    }

    // TODO: Send reminder email to user about trial ending
  } catch {
    // Silently fail for trial end reminders
  }
}

