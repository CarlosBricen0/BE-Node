-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "entitlementPaymentId" TEXT,
ADD COLUMN     "intentId" TEXT,
ADD COLUMN     "lastReconciledAt" TIMESTAMP(3),
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'stripe',
ADD COLUMN     "providerSubscriptionId" TEXT,
ADD COLUMN     "providerUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'stripe',
ADD COLUMN     "providerPreferenceId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "intentId" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'stripe',
ADD COLUMN     "providerUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "refundedAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'approved';

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "lastReconciledAt" TIMESTAMP(3),
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "months" INTEGER,
    "planId" TEXT,
    "orderId" TEXT,
    "providerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_orderId_key" ON "PaymentIntent"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_providerId_key" ON "PaymentIntent"("providerId");

-- CreateIndex
CREATE INDEX "PaymentIntent_userId_kind_status_idx" ON "PaymentIntent"("userId", "kind", "status");

-- CreateIndex
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_providerPreferenceId_key" ON "Order"("providerPreferenceId");

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Preserve legacy USD values; all new Mercado Pago intents use whole positive CLP pesos.
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_amount_currency_check" CHECK ("amount" > 0 AND "currency" = 'CLP');
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_kind_months_check" CHECK (("kind" = 'subscription' AND "months" IN (1,12) AND "planId" IS NOT NULL) OR ("kind" = 'merchandise' AND "months" IS NULL AND "orderId" IS NOT NULL));
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refunded_amount_check" CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "amount");
