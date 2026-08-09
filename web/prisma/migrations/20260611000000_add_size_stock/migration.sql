-- AlterTable: add per-size stock breakdown column to AdminProduct
ALTER TABLE "AdminProduct" ADD COLUMN IF NOT EXISTS "sizeStock" TEXT;
