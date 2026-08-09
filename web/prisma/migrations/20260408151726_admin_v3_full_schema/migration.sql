/*
  Warnings:

  - Added the required column `updatedAt` to the `ClientMeasurement` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "CustomOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "measurementId" TEXT,
    "designerId" TEXT,
    "quoteId" TEXT,
    "eventType" TEXT,
    "eventDate" TEXT,
    "deadline" TEXT,
    "designDescription" TEXT,
    "inspirationNotes" TEXT,
    "inspirationImages" TEXT,
    "colorPreferences" TEXT,
    "fabricPreferences" TEXT,
    "estimatedPrice" REAL,
    "finalPrice" REAL,
    "depositAmount" REAL NOT NULL DEFAULT 0,
    "totalPaid" REAL NOT NULL DEFAULT 0,
    "balance" REAL,
    "status" TEXT NOT NULL DEFAULT 'inquiry_received',
    "assignedFabric" TEXT,
    "productionNotes" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "rushFee" REAL NOT NULL DEFAULT 0,
    "source" TEXT,
    "tags" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomOrder_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "ClientMeasurement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CustomOrder_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "PartnerDesigner" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CustomOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customOrderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "category" TEXT,
    "notes" TEXT,
    "uploadedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderAttachment_customOrderId_fkey" FOREIGN KEY ("customOrderId") REFERENCES "CustomOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customOrderId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "performedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderActivity_customOrderId_fkey" FOREIGN KEY ("customOrderId") REFERENCES "CustomOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomOrderPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentId" TEXT NOT NULL,
    "customOrderId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT,
    "paymentType" TEXT,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "recordedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomOrderPayment_customOrderId_fkey" FOREIGN KEY ("customOrderId") REFERENCES "CustomOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Fitting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customOrderId" TEXT,
    "clientId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'standard',
    "scheduledDate" DATETIME NOT NULL,
    "scheduledTime" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "location" TEXT,
    "fitter" TEXT,
    "notes" TEXT,
    "alterationsNeeded" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Fitting_customOrderId_fkey" FOREIGN KEY ("customOrderId") REFERENCES "CustomOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RentalOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rentalId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "rentalItemId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "returnDate" DATETIME,
    "rentalPrice" REAL NOT NULL,
    "deposit" REAL NOT NULL DEFAULT 0,
    "totalPaid" REAL NOT NULL DEFAULT 0,
    "lateFee" REAL NOT NULL DEFAULT 0,
    "damageFee" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "conditionOut" TEXT,
    "conditionIn" TEXT,
    "cleaningNeeded" BOOLEAN NOT NULL DEFAULT false,
    "damageNotes" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RentalOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RentalOrder_rentalItemId_fkey" FOREIGN KEY ("rentalItemId") REFERENCES "RentalItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RentalItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "size" TEXT,
    "color" TEXT,
    "images" TEXT,
    "rentalPrice" REAL NOT NULL,
    "replacementCost" REAL,
    "condition" TEXT NOT NULL DEFAULT 'excellent',
    "maintenanceStatus" TEXT NOT NULL DEFAULT 'clean',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "timesRented" INTEGER NOT NULL DEFAULT 0,
    "lastCleaned" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PartnerDesigner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "designerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "specialty" TEXT,
    "bio" TEXT,
    "portfolioUrl" TEXT,
    "profileImage" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "maxCapacity" INTEGER NOT NULL DEFAULT 5,
    "currentLoad" INTEGER NOT NULL DEFAULT 0,
    "rating" REAL NOT NULL DEFAULT 5.0,
    "completedOrders" INTEGER NOT NULL DEFAULT 0,
    "avgDeliveryDays" INTEGER,
    "priceRange" TEXT,
    "tags" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdminConsultation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consultId" TEXT NOT NULL,
    "clientId" TEXT,
    "clientName" TEXT,
    "type" TEXT NOT NULL DEFAULT 'virtual',
    "purpose" TEXT,
    "scheduledDate" DATETIME NOT NULL,
    "scheduledTime" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "assignedTo" TEXT,
    "preNotes" TEXT,
    "sessionNotes" TEXT,
    "outcome" TEXT,
    "followUpDate" TEXT,
    "aiSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdminConsultation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "lineItems" TEXT NOT NULL,
    "materialsTotal" REAL NOT NULL DEFAULT 0,
    "laborTotal" REAL NOT NULL DEFAULT 0,
    "fittingFee" REAL NOT NULL DEFAULT 0,
    "rushFee" REAL NOT NULL DEFAULT 0,
    "deliveryFee" REAL NOT NULL DEFAULT 0,
    "discount" REAL NOT NULL DEFAULT 0,
    "discountType" TEXT,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "tax" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "validUntil" TEXT,
    "notes" TEXT,
    "terms" TEXT,
    "convertedToOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "longDescription" TEXT,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "gender" TEXT,
    "price" REAL NOT NULL,
    "compareAtPrice" REAL,
    "costPrice" REAL,
    "images" TEXT,
    "sizes" TEXT,
    "colors" TEXT,
    "materials" TEXT,
    "trackInventory" BOOLEAN NOT NULL DEFAULT true,
    "totalStock" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isNewArrival" BOOLEAN NOT NULL DEFAULT false,
    "slug" TEXT,
    "tags" TEXT,
    "collectionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdminProduct_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "AdminCollection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "material" TEXT,
    "price" REAL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "AdminProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminCollection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "image" TEXT,
    "season" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FeaturedPlacement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "subtitle" TEXT,
    "ctaText" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FeaturedPlacement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "AdminProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StorefrontBanner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT,
    "linkUrl" TEXT,
    "position" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdminOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "fabric" TEXT,
    "totalPrice" REAL,
    "deposit" REAL NOT NULL DEFAULT 0,
    "totalPaid" REAL NOT NULL DEFAULT 0,
    "balance" REAL,
    "status" TEXT NOT NULL DEFAULT 'Inquiry',
    "orderType" TEXT NOT NULL DEFAULT 'ready-to-wear',
    "dueDate" TEXT,
    "notes" TEXT,
    "paymentStatus" TEXT,
    "productionAllowed" TEXT NOT NULL DEFAULT 'HOLD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdminOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AdminOrder" ("balance", "clientId", "createdAt", "deposit", "dueDate", "fabric", "id", "item", "notes", "orderId", "paymentStatus", "productionAllowed", "status", "totalPaid", "totalPrice", "updatedAt") SELECT "balance", "clientId", "createdAt", "deposit", "dueDate", "fabric", "id", "item", "notes", "orderId", "paymentStatus", "productionAllowed", "status", "totalPaid", "totalPrice", "updatedAt" FROM "AdminOrder";
DROP TABLE "AdminOrder";
ALTER TABLE "new_AdminOrder" RENAME TO "AdminOrder";
CREATE UNIQUE INDEX "AdminOrder_orderId_key" ON "AdminOrder"("orderId");
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "instagram" TEXT,
    "email" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "gender" TEXT,
    "vipTier" TEXT NOT NULL DEFAULT 'standard',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Client" ("city", "clientId", "createdAt", "email", "id", "instagram", "name", "notes", "phone", "updatedAt") SELECT "city", "clientId", "createdAt", "email", "id", "instagram", "name", "notes", "phone", "updatedAt" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_clientId_key" ON "Client"("clientId");
CREATE TABLE "new_ClientMeasurement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "profileName" TEXT NOT NULL DEFAULT 'Default',
    "bust" REAL,
    "waist" REAL,
    "hip" REAL,
    "shoulder" REAL,
    "sleeve" REAL,
    "length" REAL,
    "inseam" REAL,
    "neckline" REAL,
    "armhole" REAL,
    "backWidth" REAL,
    "frontLength" REAL,
    "skirtLength" REAL,
    "trouserLength" REAL,
    "fitPreference" TEXT,
    "notes" TEXT,
    "accuracy" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "measuredBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientMeasurement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ClientMeasurement" ("bust", "clientId", "createdAt", "hip", "id", "length", "notes", "shoulder", "sleeve", "waist") SELECT "bust", "clientId", "createdAt", "hip", "id", "length", "notes", "shoulder", "sleeve", "waist" FROM "ClientMeasurement";
DROP TABLE "ClientMeasurement";
ALTER TABLE "new_ClientMeasurement" RENAME TO "ClientMeasurement";
CREATE TABLE "new_FabricInventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fabricType" TEXT NOT NULL,
    "color" TEXT,
    "quantity" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'yards',
    "supplier" TEXT,
    "cost" REAL,
    "usedForOrder" TEXT,
    "minStock" REAL NOT NULL DEFAULT 0,
    "location" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_FabricInventory" ("color", "cost", "createdAt", "fabricType", "id", "quantity", "supplier", "unit", "updatedAt", "usedForOrder") SELECT "color", "cost", "createdAt", "fabricType", "id", "quantity", "supplier", "unit", "updatedAt", "usedForOrder" FROM "FabricInventory";
DROP TABLE "FabricInventory";
ALTER TABLE "new_FabricInventory" RENAME TO "FabricInventory";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CustomOrder_orderId_key" ON "CustomOrder"("orderId");

-- CreateIndex
CREATE INDEX "CustomOrder_status_idx" ON "CustomOrder"("status");

-- CreateIndex
CREATE INDEX "CustomOrder_clientId_idx" ON "CustomOrder"("clientId");

-- CreateIndex
CREATE INDEX "CustomOrder_designerId_idx" ON "CustomOrder"("designerId");

-- CreateIndex
CREATE INDEX "OrderActivity_customOrderId_idx" ON "OrderActivity"("customOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomOrderPayment_paymentId_key" ON "CustomOrderPayment"("paymentId");

-- CreateIndex
CREATE INDEX "Fitting_scheduledDate_idx" ON "Fitting"("scheduledDate");

-- CreateIndex
CREATE INDEX "Fitting_status_idx" ON "Fitting"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RentalOrder_rentalId_key" ON "RentalOrder"("rentalId");

-- CreateIndex
CREATE INDEX "RentalOrder_status_idx" ON "RentalOrder"("status");

-- CreateIndex
CREATE INDEX "RentalOrder_startDate_idx" ON "RentalOrder"("startDate");

-- CreateIndex
CREATE UNIQUE INDEX "RentalItem_itemId_key" ON "RentalItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerDesigner_designerId_key" ON "PartnerDesigner"("designerId");

-- CreateIndex
CREATE INDEX "PartnerDesigner_status_idx" ON "PartnerDesigner"("status");

-- CreateIndex
CREATE INDEX "PartnerDesigner_specialty_idx" ON "PartnerDesigner"("specialty");

-- CreateIndex
CREATE UNIQUE INDEX "AdminConsultation_consultId_key" ON "AdminConsultation"("consultId");

-- CreateIndex
CREATE INDEX "AdminConsultation_scheduledDate_idx" ON "AdminConsultation"("scheduledDate");

-- CreateIndex
CREATE INDEX "AdminConsultation_status_idx" ON "AdminConsultation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteId_key" ON "Quote"("quoteId");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "Quote_clientId_idx" ON "Quote"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminProduct_sku_key" ON "AdminProduct"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "AdminProduct_slug_key" ON "AdminProduct"("slug");

-- CreateIndex
CREATE INDEX "AdminProduct_category_idx" ON "AdminProduct"("category");

-- CreateIndex
CREATE INDEX "AdminProduct_isPublished_idx" ON "AdminProduct"("isPublished");

-- CreateIndex
CREATE INDEX "AdminProduct_isFeatured_idx" ON "AdminProduct"("isFeatured");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminCollection_slug_key" ON "AdminCollection"("slug");

-- CreateIndex
CREATE INDEX "FeaturedPlacement_section_idx" ON "FeaturedPlacement"("section");

-- CreateIndex
CREATE INDEX "FeaturedPlacement_isActive_idx" ON "FeaturedPlacement"("isActive");

-- CreateIndex
CREATE INDEX "StorefrontBanner_position_idx" ON "StorefrontBanner"("position");

-- CreateIndex
CREATE INDEX "StorefrontBanner_isActive_idx" ON "StorefrontBanner"("isActive");
