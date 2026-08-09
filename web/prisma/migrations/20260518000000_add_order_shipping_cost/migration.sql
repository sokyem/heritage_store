-- Storefront orders now charge real shipping selected from carrier rate quotes.
-- All three columns are nullable so existing rows continue to validate.
ALTER TABLE "Order" ADD COLUMN "shippingCost" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN "shippingService" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingCarrier" TEXT;
