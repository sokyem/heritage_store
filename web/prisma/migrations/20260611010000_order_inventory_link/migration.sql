-- AlterTable: add structured variant + inventory-deduct fields to Order
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "adminProductId" TEXT,
  ADD COLUMN IF NOT EXISTS "selectedSize"   TEXT,
  ADD COLUMN IF NOT EXISTS "selectedColor"  TEXT,
  ADD COLUMN IF NOT EXISTS "quantity"       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "stockDeducted"  BOOLEAN NOT NULL DEFAULT false;
