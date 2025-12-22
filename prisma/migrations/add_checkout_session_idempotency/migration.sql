-- CreateTable
CREATE TABLE "CheckoutSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "stripeSessionUrl" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "CheckoutSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_stripeSessionId_key" ON "CheckoutSession"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutSession_idempotencyKey_key" ON "CheckoutSession"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CheckoutSession_userId_storeId_priceId_idx" ON "CheckoutSession"("userId", "storeId", "priceId");

-- CreateIndex
CREATE INDEX "CheckoutSession_createdAt_idx" ON "CheckoutSession"("createdAt");

-- CreateIndex
CREATE INDEX "CheckoutSession_idempotencyKey_idx" ON "CheckoutSession"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CheckoutSession_stripeSessionId_idx" ON "CheckoutSession"("stripeSessionId");




























