CREATE TABLE "AdBatchAnalysis" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "campaignIds" JSONB NOT NULL,
    "createdById" TEXT,
    "contentReview" TEXT NOT NULL DEFAULT '',
    "performanceAnalysis" TEXT NOT NULL DEFAULT '',
    "recommendations" JSONB NOT NULL DEFAULT '[]',
    "model" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdBatchAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdBatchAnalysis_businessId_idx" ON "AdBatchAnalysis"("businessId");
CREATE INDEX "AdBatchAnalysis_createdById_idx" ON "AdBatchAnalysis"("createdById");

ALTER TABLE "AdBatchAnalysis" ADD CONSTRAINT "AdBatchAnalysis_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdBatchAnalysis" ADD CONSTRAINT "AdBatchAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
