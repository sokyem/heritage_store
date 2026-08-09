-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "instagram" TEXT,
    "email" TEXT,
    "city" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ClientMeasurement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "bust" REAL,
    "waist" REAL,
    "hip" REAL,
    "shoulder" REAL,
    "sleeve" REAL,
    "length" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientMeasurement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminOrder" (
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
    "dueDate" TEXT,
    "notes" TEXT,
    "paymentStatus" TEXT,
    "productionAllowed" TEXT NOT NULL DEFAULT 'HOLD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdminOrder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductionTracker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'LOW',
    "stage" TEXT NOT NULL DEFAULT 'Order Received',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProductionTracker_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AdminOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "amount" REAL,
    "method" TEXT,
    "date" DATETIME,
    "paymentType" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AdminOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FabricInventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fabricType" TEXT NOT NULL,
    "color" TEXT,
    "quantity" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'yards',
    "supplier" TEXT,
    "cost" REAL,
    "usedForOrder" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_clientId_key" ON "Client"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminOrder_orderId_key" ON "AdminOrder"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionTracker_orderId_key" ON "ProductionTracker"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_paymentId_key" ON "PaymentRecord"("paymentId");
