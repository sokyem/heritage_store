-- Link Shipment rows to storefront e-commerce Order rows so the admin
-- shipping flow can auto-fill addresses and persist the relationship.
ALTER TABLE "Shipment" ADD COLUMN "storefrontOrderId" TEXT;
CREATE INDEX "Shipment_storefrontOrderId_idx" ON "Shipment"("storefrontOrderId");
