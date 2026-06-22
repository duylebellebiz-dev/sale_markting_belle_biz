-- Free-form AI chat thread per campaign (multilingual Q&A, separate from AdAnalysis).
CREATE TYPE "AdChatRole" AS ENUM ('user', 'assistant');

ALTER TABLE "AdConnection" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "AdChatMessage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "role" "AdChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdChatMessage_businessId_idx" ON "AdChatMessage"("businessId");
CREATE INDEX "AdChatMessage_campaignId_idx" ON "AdChatMessage"("campaignId");
CREATE INDEX "AdChatMessage_campaignId_createdAt_idx" ON "AdChatMessage"("campaignId", "createdAt");

ALTER TABLE "AdChatMessage" ADD CONSTRAINT "AdChatMessage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdChatMessage" ADD CONSTRAINT "AdChatMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdChatMessage" ADD CONSTRAINT "AdChatMessage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
