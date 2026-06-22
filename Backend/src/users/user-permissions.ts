export type UserRole = 'owner' | 'salesperson';

export interface UserPermissions {
  viewAllCustomers: boolean;
  manageCustomers: boolean;
  sendEmail: boolean;
  manageEmailTemplates: boolean;
  createInvoice: boolean;
  exportInvoicePdf: boolean;
  manageServices: boolean;
  viewReports: boolean;
  exportExcel: boolean;
  importData: boolean;
  analyzeAds: boolean;
  manageStaff: boolean;
}

// Defaults for a newly created salesperson.
// Owners always pass permission checks regardless of these values.
export const DEFAULT_SALESPERSON_PERMISSIONS: UserPermissions = {
  viewAllCustomers: false,
  manageCustomers: true,
  sendEmail: true,
  manageEmailTemplates: false,
  createInvoice: true,
  exportInvoicePdf: false,
  manageServices: false,
  viewReports: false,
  exportExcel: false,
  importData: false,
  analyzeAds: false,
  manageStaff: false,
};
