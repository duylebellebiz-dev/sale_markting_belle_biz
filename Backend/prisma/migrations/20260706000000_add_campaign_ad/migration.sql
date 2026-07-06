-- CreateTable
CREATE TABLE "CampaignAd" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "externalAdId" TEXT NOT NULL,
    "adsetId" TEXT NOT NULL DEFAULT '',
    "adsetName" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "headline" TEXT NOT NULL DEFAULT '',
    "creativeText" TEXT NOT NULL DEFAULT '',
    "creativeImageUrl" TEXT NOT NULL DEFAULT '',
    "conversationTemplate" TEXT NOT NULL DEFAULT '',
    "raw" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignAd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignAd_businessId_idx" ON "CampaignAd"("businessId");

-- CreateIndex
CREATE INDEX "CampaignAd_campaignId_idx" ON "CampaignAd"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignAd_campaignId_externalAdId_key" ON "CampaignAd"("campaignId", "externalAdId");

-- AddForeignKey
ALTER TABLE "CampaignAd" ADD CONSTRAINT "CampaignAd_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAd" ADD CONSTRAINT "CampaignAd_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

