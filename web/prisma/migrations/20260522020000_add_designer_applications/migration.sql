-- Designer onboarding is now an approval-gated process: applicants submit a
-- public form, an admin works a verification checklist, and only on approval
-- is a PartnerDesigner record created.
CREATE TABLE "DesignerApplication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "businessName" TEXT,
    "specialty" TEXT,
    "portfolioUrl" TEXT,
    "yearsExperience" INTEGER,
    "bio" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "portfolioReviewed" BOOLEAN NOT NULL DEFAULT false,
    "referencesChecked" BOOLEAN NOT NULL DEFAULT false,
    "backgroundCheckPassed" BOOLEAN NOT NULL DEFAULT false,
    "reviewNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "partnerDesignerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignerApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DesignerApplication_status_idx" ON "DesignerApplication"("status");
CREATE INDEX "DesignerApplication_email_idx" ON "DesignerApplication"("email");
