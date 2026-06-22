-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "claudeApiKey" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "permissions" SET DEFAULT '{"viewAllCustomers":false,"manageCustomers":true,"sendEmail":true,"manageEmailTemplates":false,"createInvoice":true,"exportInvoicePdf":false,"manageServices":false,"viewReports":false,"exportExcel":false,"importData":false,"analyzeAds":false,"manageStaff":false}';
