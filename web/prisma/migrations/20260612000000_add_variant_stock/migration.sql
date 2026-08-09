-- Add per-color×size variant stock matrix to AdminProduct
ALTER TABLE "AdminProduct" ADD COLUMN IF NOT EXISTS "variantStock" TEXT;
