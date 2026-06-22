-- Split AdAccount into AdConnection (per-user OAuth token) + AdAccount (per fanpage/ad
-- account discovered under that token) + AdAccountAccess (sharing one account with
-- other staff). See migrate-ad-accounts.js for the one-off data backfill that ran
-- against the existing AdAccount rows in this environment.

CREATE TABLE "AdConnection" (
  "id" TEXT PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "AdProvider" NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL DEFAULT '',
  "tokenExpiresAt" TIMESTAMP(3),
  "status" "AdAccountStatus" NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE INDEX "AdConnection_businessId_idx" ON "AdConnection"("businessId");
CREATE INDEX "AdConnection_userId_idx" ON "AdConnection"("userId");
CREATE UNIQUE INDEX "AdConnection_userId_provider_key" ON "AdConnection"("userId","provider");
ALTER TABLE "AdConnection" ADD CONSTRAINT "AdConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdConnection" ADD CONSTRAINT "AdConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdAccount" ADD COLUMN "connectionId" TEXT;
-- (data backfill of connectionId for pre-existing rows happens out-of-band, before this column is set NOT NULL)
ALTER TABLE "AdAccount" ALTER COLUMN "connectionId" SET NOT NULL;

ALTER TABLE "AdAccount" DROP CONSTRAINT "AdAccount_userId_fkey";
DROP INDEX "AdAccount_userId_provider_key";
DROP INDEX "AdAccount_userId_idx";
ALTER TABLE "AdAccount" DROP COLUMN "userId";
ALTER TABLE "AdAccount" DROP COLUMN "accessToken";
ALTER TABLE "AdAccount" DROP COLUMN "refreshToken";
ALTER TABLE "AdAccount" DROP COLUMN "tokenExpiresAt";

ALTER TABLE "AdAccount" ADD CONSTRAINT "AdAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "AdConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "AdAccount_connectionId_idx" ON "AdAccount"("connectionId");
CREATE UNIQUE INDEX "AdAccount_connectionId_externalAccountId_key" ON "AdAccount"("connectionId","externalAccountId");

CREATE TABLE "AdAccountAccess" (
  "id" TEXT PRIMARY KEY,
  "adAccountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "AdAccountAccess_adAccountId_userId_key" ON "AdAccountAccess"("adAccountId","userId");
CREATE INDEX "AdAccountAccess_userId_idx" ON "AdAccountAccess"("userId");
ALTER TABLE "AdAccountAccess" ADD CONSTRAINT "AdAccountAccess_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdAccountAccess" ADD CONSTRAINT "AdAccountAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
