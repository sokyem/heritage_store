-- Quote client-facing share & payment fields
ALTER TABLE "Quote"
  ADD COLUMN "accessToken" TEXT,
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "viewedAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "depositPercent" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "depositAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "depositPaidAt" TIMESTAMP(3),
  ADD COLUMN "stripePaymentIntentId" TEXT,
  ADD COLUMN "stripeCheckoutSessionId" TEXT;

CREATE UNIQUE INDEX "Quote_accessToken_key" ON "Quote"("accessToken");
