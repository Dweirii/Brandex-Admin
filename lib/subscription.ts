import prismadb from "@/lib/prismadb";
import { SubscriptionStatus, subscriptions } from "@prisma/client";

const ACTIVE_SUBSCRIPTION_STATUS: SubscriptionStatus[] = [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.TRIALING,
]

export async function hasActiveSubscription(
    userId: string,
    storeId: string,
): Promise<boolean> {
    try {
        if(!userId || !storeId) {
            return false;
        }

        const subscription = await prismadb.subscriptions.findUnique({
            where: {
                userId_storeId: {
                    userId,
                    storeId,
                },
            },
            select: {
                status: true,
                currentPeriodEnd: true,
                trialEnd: true,
                cancelAtPeriodEnd: true,
            },
        });

        if(!subscription) {
            return false;
        }

        const isActiveStatus = ACTIVE_SUBSCRIPTION_STATUS.includes(subscription.status);

        if (!isActiveStatus) {
            console.log('Subscription is not active', subscription.status);
            return false;
        }
        
        if(subscription.status === SubscriptionStatus.TRIALING && subscription.trialEnd) {
            const now = new Date();
            const trialEnd = new Date(subscription.trialEnd);

            if (now > trialEnd) {
                console.log('Trial period ended', subscription.status);
                return false;
            }
        }

        if (subscription.currentPeriodEnd){
            const now = new Date();
            const periodEnd = new Date(subscription.currentPeriodEnd);

            if (now > periodEnd) {
                console.log('Subscription period ended', subscription.status);
                return false;
            }
        }

        return true;
    } catch (error) {
        console.error('Error checking active subscription', error);
        return false;
    }
}

export async function getSubscriptionStatus(
    userId: string,
    storeId: string
  ): Promise<(subscriptions & { Store: { id: string; name: string } }) | null> {
    try {
      if (!userId || !storeId) {
        console.warn("[SUBSCRIPTION] Missing userId or storeId", { userId, storeId });
        return null;
      }
  
      const subscription = await prismadb.subscriptions.findUnique({
        where: {
          userId_storeId: {
            userId,
            storeId,
          },
        },
        include: {
          Store: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
  
      if (!subscription) {
        console.log("[SUBSCRIPTION] No subscription found", { userId, storeId });
        return null;
      }
  
      console.log("[SUBSCRIPTION] Subscription retrieved", {
        userId,
        storeId,
        status: subscription.status,
      });
  
      return subscription;
    } catch (error) {
      console.error("[SUBSCRIPTION] Error getting subscription status", {
        userId,
        storeId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  }

  /**
   * Alias for hasActiveSubscription - checks if user is a premium subscriber
   * 
   * @param userId - Clerk user ID
   * @param storeId - Store ID (required for multi-tenant architecture)
   * @returns Promise<boolean> - true if user has premium access
   */
  export async function isPremiumUser(
    userId: string,
    storeId: string
  ): Promise<boolean> {
    return hasActiveSubscription(userId, storeId);
  }

  export async function checkSubscriptionAccess(
    userId: string,
    productId: string,
    storeId: string
  ): Promise<boolean> {
    try {
      if (!userId || !productId || !storeId) {
        console.warn("[SUBSCRIPTION] Missing required parameters", {
          userId,
          productId,
          storeId,
        });
        return false;
      }
  
      // First, check if user has active subscription (premium access)
      const hasSubscription = await hasActiveSubscription(userId, storeId);
      
      if (hasSubscription) {
        console.log("[SUBSCRIPTION] Access granted via subscription", {
          userId,
          productId,
          storeId,
        });
        return true;
      }
  
      // If no subscription, check if user has purchased this product
      const purchasedOrder = await prismadb.order.findFirst({
        where: {
          userId,
          storeId,
          isPaid: true,
          OrderItem: {
            some: {
              productId,
            },
          },
        },
        select: {
          id: true,
        },
      });
  
      if (purchasedOrder) {
        console.log("[SUBSCRIPTION] Access granted via purchase", {
          userId,
          productId,
          storeId,
          orderId: purchasedOrder.id,
        });
        return true;
      }
  
      console.log("[SUBSCRIPTION] Access denied - no subscription or purchase", {
        userId,
        productId,
        storeId,
      });
  
      return false;
    } catch (error) {
      console.error("[SUBSCRIPTION] Error checking subscription access", {
        userId,
        productId,
        storeId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Fail securely: return false on error
      return false;
    }
  }
  
  /**
   * Check if a subscription is currently in trial period
   * 
   * @param subscription - Subscription object from database
   * @returns boolean - true if subscription is in trial period
   */
  export function isInTrialPeriod(subscription: {
    status: SubscriptionStatus;
    trialStart: Date | null;
    trialEnd: Date | null;
  }): boolean {
    if (subscription.status !== SubscriptionStatus.TRIALING) {
      return false;
    }
  
    if (!subscription.trialEnd) {
      return false;
    }
  
    const now = new Date();
    const trialEnd = new Date(subscription.trialEnd);
  
    return now <= trialEnd;
  }
  
  /**
   * Check if a subscription is canceled but still active (within current period)
   * 
   * @param subscription - Subscription object from database
   * @returns boolean - true if subscription is canceled but still active
   */
  export function isCanceledButActive(subscription: {
    status: SubscriptionStatus;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
  }): boolean {
    if (!subscription.cancelAtPeriodEnd) {
      return false;
    }
  
    if (!subscription.currentPeriodEnd) {
      return false;
    }
  
    const now = new Date();
    const periodEnd = new Date(subscription.currentPeriodEnd);
  
    return now <= periodEnd;
  }
  
  /**
   * Get subscription status with human-readable description
   * 
   * @param subscription - Subscription object from database
   * @returns Object with status and description
   */
  export function getSubscriptionStatusInfo(subscription: {
    status: SubscriptionStatus;
    trialStart: Date | null;
    trialEnd: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  }): {
    status: SubscriptionStatus;
    description: string;
    isActive: boolean;
    daysRemaining: number | null;
  } {
    const isActive = ACTIVE_SUBSCRIPTION_STATUS.includes(subscription.status);
    const inTrial = isInTrialPeriod(subscription);
    const canceledButActive = isCanceledButActive(subscription);
  
    let description = "";
    let daysRemaining: number | null = null;
  
    if (inTrial && subscription.trialEnd) {
      const now = new Date();
      const trialEnd = new Date(subscription.trialEnd);
      const diffTime = trialEnd.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      description = `Trial ends in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`;
    } else if (canceledButActive && subscription.currentPeriodEnd) {
      const now = new Date();
      const periodEnd = new Date(subscription.currentPeriodEnd);
      const diffTime = periodEnd.getTime() - now.getTime();
      daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      description = `Canceled - access until ${periodEnd.toLocaleDateString()} (${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining)`;
    } else if (subscription.status === SubscriptionStatus.ACTIVE) {
      if (subscription.currentPeriodEnd) {
        const now = new Date();
        const periodEnd = new Date(subscription.currentPeriodEnd);
        const diffTime = periodEnd.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        description = `Active - renews in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`;
      } else {
        description = "Active";
      }
    } else {
      description = subscription.status;
    }
  
    return {
      status: subscription.status,
      description,
      isActive,
      daysRemaining,
    };
  }