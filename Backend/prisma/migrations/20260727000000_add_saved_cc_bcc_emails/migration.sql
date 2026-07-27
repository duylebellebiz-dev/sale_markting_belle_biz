-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "savedCcBccEmails" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "bcc" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "cc" TEXT NOT NULL DEFAULT '';
