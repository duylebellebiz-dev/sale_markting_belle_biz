-- CreateEnum
CREATE TYPE "AdProvider" AS ENUM ('facebook', 'google');

-- CreateEnum
CREATE TYPE "AdAccountStatus" AS ENUM ('active', 'disconnected', 'error');

-- CreateTable
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "provider" "AdProvider" NOT NULL,
    "externalAccountId" TEXT NOT NULL DEFAULT '',
    "accountName" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "AdAccountStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdAccount_businessId_idx" ON "AdAccount"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_businessId_provider_key" ON "AdAccount"("businessId", "provider");

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
