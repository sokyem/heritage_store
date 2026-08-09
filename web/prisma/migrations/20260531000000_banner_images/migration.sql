-- Multiple images per storefront banner (additive; imageUrl kept as primary).
ALTER TABLE "StorefrontBanner" ADD COLUMN IF NOT EXISTS "images" TEXT;
