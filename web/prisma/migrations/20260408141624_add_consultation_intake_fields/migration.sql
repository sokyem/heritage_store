-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Consultation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "notes" TEXT,
    "eventType" TEXT,
    "eventDate" TEXT,
    "budget" TEXT,
    "stylePreferences" TEXT,
    "bodyType" TEXT,
    "colors" TEXT,
    "inspiration" TEXT,
    "specialNotes" TEXT,
    "analysisStatus" TEXT NOT NULL DEFAULT 'pending',
    "aiRecommendations" TEXT,
    "styleSummary" TEXT,
    "fabricSuggestions" TEXT,
    "designNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Consultation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Consultation" ("createdAt", "date", "id", "notes", "status", "userId") SELECT "createdAt", "date", "id", "notes", "status", "userId" FROM "Consultation";
DROP TABLE "Consultation";
ALTER TABLE "new_Consultation" RENAME TO "Consultation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
