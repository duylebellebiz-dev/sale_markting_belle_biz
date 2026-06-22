-- CreateTable
CREATE TABLE "AdAnalysis" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "createdById" TEXT,
    "contentReview" TEXT NOT NULL DEFAULT '',
    "performanceAnalysis" TEXT NOT NULL DEFAULT '',
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdAnalysis_businessId_idx" ON "AdAnalysis"("businessId");

-- CreateIndex
CREATE INDEX "AdAnalysis_campaignId_idx" ON "AdAnalysis"("campaignId");

-- CreateIndex
CREATE INDEX "AdAnalysis_campaignId_createdAt_idx" ON "AdAnalysis"("campaignId", "createdAt");

-- AddForeignKey
ALTER TABLE "AdAnalysis" ADD CONSTRAINT "AdAnalysis_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAnalysis" ADD CONSTRAINT "AdAnalysis_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAnalysis" ADD CONSTRAINT "AdAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
