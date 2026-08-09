-- Mailing list & marketing: customer opt-out flags, newsletter subscribers,
-- back-in-stock requests, and campaign send history.

-- User marketing fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "marketingOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "marketingToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "unsubscribedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "User_marketingToken_idx" ON "User"("marketingToken");

-- Newsletter subscribers (opt-ins without an account)
CREATE TABLE IF NOT EXISTS "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'footer',
    "status" TEXT NOT NULL DEFAULT 'subscribed',
    "unsubToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSubscriber_unsubToken_key" ON "NewsletterSubscriber"("unsubToken");
CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_status_idx" ON "NewsletterSubscriber"("status");

-- Back-in-stock notify-me requests
CREATE TABLE IF NOT EXISTS "BackInStockRequest" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "productId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BackInStockRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BackInStockRequest_email_productId_key" ON "BackInStockRequest"("email", "productId");
CREATE INDEX IF NOT EXISTS "BackInStockRequest_productId_idx" ON "BackInStockRequest"("productId");
CREATE INDEX IF NOT EXISTS "BackInStockRequest_notifiedAt_idx" ON "BackInStockRequest"("notifiedAt");
ALTER TABLE "BackInStockRequest" ADD CONSTRAINT "BackInStockRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "AdminProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Marketing campaigns (send history / dedupe)
CREATE TABLE IF NOT EXISTS "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'manual',
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'all',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "productId" TEXT,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MarketingCampaign_type_idx" ON "MarketingCampaign"("type");
CREATE INDEX IF NOT EXISTS "MarketingCampaign_status_idx" ON "MarketingCampaign"("status");
CREATE INDEX IF NOT EXISTS "MarketingCampaign_productId_idx" ON "MarketingCampaign"("productId");
