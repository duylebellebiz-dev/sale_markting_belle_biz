-- CreateTable
CREATE TABLE "CampaignKeyword" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "spend" DECIMAL(14,4),
    "ctr" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignSearchTerm" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "spend" DECIMAL(14,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignSearchTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTargeting" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "provider" "AdProvider" NOT NULL,
    "ageRanges" JSONB NOT NULL DEFAULT '[]',
    "genders" JSONB NOT NULL DEFAULT '[]',
    "locations" JSONB NOT NULL DEFAULT '[]',
    "interests" JSONB NOT NULL DEFAULT '[]',
    "languages" JSONB NOT NULL DEFAULT '[]',
    "raw" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignTargeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignDemographic" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ageRange" TEXT NOT NULL DEFAULT '',
    "gender" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "impressions" BIGINT NOT NULL DEFAULT 0,
    "clicks" BIGINT NOT NULL DEFAULT 0,
    "spend" DECIMAL(14,4),
    "conversions" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignDemographic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignKeyword_businessId_idx" ON "CampaignKeyword"("businessId");

-- CreateIndex
CREATE INDEX "CampaignKeyword_campaignId_idx" ON "CampaignKeyword"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignKeyword_campaignId_text_matchType_key" ON "CampaignKeyword"("campaignId", "text", "matchType");

-- CreateIndex
CREATE INDEX "CampaignSearchTerm_businessId_idx" ON "CampaignSearchTerm"("businessId");

-- CreateIndex
CREATE INDEX "CampaignSearchTerm_campaignId_idx" ON "CampaignSearchTerm"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSearchTerm_campaignId_term_key" ON "CampaignSearchTerm"("campaignId", "term");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignTargeting_campaignId_key" ON "CampaignTargeting"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignTargeting_businessId_idx" ON "CampaignTargeting"("businessId");

-- CreateIndex
CREATE INDEX "CampaignDemographic_businessId_idx" ON "CampaignDemographic"("businessId");

-- CreateIndex
CREATE INDEX "CampaignDemographic_campaignId_idx" ON "CampaignDemographic"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignDemographic_campaignId_ageRange_gender_region_key" ON "CampaignDemographic"("campaignId", "ageRange", "gender", "region");

-- AddForeignKey
ALTER TABLE "CampaignKeyword" ADD CONSTRAINT "CampaignKeyword_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignKeyword" ADD CONSTRAINT "CampaignKeyword_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSearchTerm" ADD CONSTRAINT "CampaignSearchTerm_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSearchTerm" ADD CONSTRAINT "CampaignSearchTerm_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTargeting" ADD CONSTRAINT "CampaignTargeting_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTargeting" ADD CONSTRAINT "CampaignTargeting_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDemographic" ADD CONSTRAINT "CampaignDemographic_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignDemographic" ADD CONSTRAINT "CampaignDemographic_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
