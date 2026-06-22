-- DropIndex
DROP INDEX "AdAccount_businessId_provider_key";

-- AlterTable
ALTER TABLE "AdAccount" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "AdAccount_userId_idx" ON "AdAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAccount_userId_provider_key" ON "AdAccount"("userId", "provider");

-- AddForeignKey
ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

