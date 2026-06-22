import type { UserRole } from '../../context/AuthContext';
import type { UserPermissions } from '../staff/staffApi';

export interface NavItem {
  label: string;
  path: string;
  icon: string; // lucide-style SVG path name — rendered inline
}

const ownerNav: NavItem[] = [
  { label: 'Dashboard',       path: '/dashboard',        icon: 'home' },
  { label: 'Customers',       path: '/customers',        icon: 'users' },
  { label: 'Invoices',        path: '/invoices',         icon: 'file-text' },
  { label: 'Services',        path: '/services',         icon: 'package' },
  { label: 'Subscriptions',   path: '/subscriptions',    icon: 'repeat' },
  { label: 'Staff',           path: '/staff',            icon: 'user-plus' },
  { label: 'Email Templates', path: '/email-templates',  icon: 'mail' },
  { label: 'Send Email',      path: '/email/compose',    icon: 'send' },
  { label: 'Campaigns',       path: '/email/campaigns',  icon: 'bar-chart' },
  { label: 'Notifications',   path: '/notifications',    icon: 'bell' },
  { label: 'Branding',        path: '/branding',         icon: 'building' },
  { label: 'Import Data',     path: '/import',            icon: 'upload' },
  { label: 'AI Settings',     path: '/ai-settings',       icon: 'cpu' },
  { label: 'Email Sender',    path: '/email-sender-settings', icon: 'send' },
  { label: 'Ad Accounts',    path: '/ad-accounts',       icon: 'trending-up' },
  { label: 'Campaigns',      path: '/campaigns',          icon: 'activity' },
];

export function getNavItems(role: UserRole, permissions?: UserPermissions): NavItem[] {
  if (role === 'owner') return ownerNav;

  // Base items always shown to salespeople
  const items: NavItem[] = [
    { label: 'Dashboard',     path: '/dashboard',      icon: 'home' },
    { label: 'My Customers',  path: '/customers',      icon: 'users' },
    { label: 'Invoices',      path: '/invoices',       icon: 'file-text' },
    { label: 'Subscriptions', path: '/subscriptions',  icon: 'repeat' },
    { label: 'Notifications', path: '/notifications',  icon: 'bell' },
  ];

  // Optional items gated by permissions
  if (permissions?.importData) {
    items.push({ label: 'Import Data', path: '/import', icon: 'upload' });
  }

  if (permissions?.analyzeAds) {
    items.push(
      { label: 'Ad Accounts', path: '/ad-accounts', icon: 'trending-up' },
      { label: 'Campaigns',   path: '/campaigns',   icon: 'activity' },
    );
  }

  if (!permissions || permissions.sendEmail) {
    items.splice(4, 0,
      { label: 'Send Email',  path: '/email/compose',  icon: 'send' },
      { label: 'Campaigns',   path: '/email/campaigns', icon: 'bar-chart' },
    );
  }

  return items;
}
