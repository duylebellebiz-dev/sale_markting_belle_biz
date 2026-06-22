import api from '../../lib/api';

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

export const DEFAULT_PERMISSIONS: UserPermissions = {
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

export interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  role: 'salesperson';
  businessId: string;
  createdAt: string;
  permissions?: UserPermissions;
}

export interface CreateStaffPayload {
  fullName: string;
  email: string;
  password: string;
}

export interface UpdateStaffPayload {
  fullName?: string;
  email?: string;
  password?: string;
}

export interface PermissionsResponse {
  id: string;
  fullName: string;
  email: string;
  permissions: UserPermissions;
}

const d = <T>(res: { data: T }) => res.data;

export const staffApi = {
  list: () => api.get<StaffMember[]>('/users').then(d<StaffMember[]>),
  create: (payload: CreateStaffPayload) =>
    api.post<StaffMember>('/users', payload).then(d<StaffMember>),
  update: (id: string, payload: UpdateStaffPayload) =>
    api.patch<StaffMember>(`/users/${id}`, payload).then(d<StaffMember>),
  remove: (id: string) => api.delete(`/users/${id}`),

  getPermissions: (id: string) =>
    api.get<PermissionsResponse>(`/users/${id}/permissions`).then(d<PermissionsResponse>),
  updatePermissions: (id: string, payload: Partial<UserPermissions>) =>
    api.patch<PermissionsResponse>(`/users/${id}/permissions`, payload).then(d<PermissionsResponse>),
};
