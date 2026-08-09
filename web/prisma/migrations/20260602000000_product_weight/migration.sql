-- Per-product shipping weight in pounds (nullable; defaults applied at label time).
ALTER TABLE "AdminProduct" ADD COLUMN IF NOT EXISTS "weightLb" DOUBLE PRECISION;
