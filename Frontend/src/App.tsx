import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationsProvider } from './features/notifications/NotificationsContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import InvoicesPage from './pages/InvoicesPage';
import ServicesPage from './pages/ServicesPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import StaffPage from './pages/StaffPage';
import NotificationsPage from './pages/NotificationsPage';
import EmailTemplatesPage from './pages/EmailTemplatesPage';
import EmailComposePage from './pages/EmailComposePage';
import EmailCampaignsPage from './pages/EmailCampaignsPage';
import BrandingPage from './pages/BrandingPage';
import InvoiceBuilderPage from './pages/InvoiceBuilderPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import ImportPage from './pages/ImportPage';
import AiSettingsPage from './pages/AiSettingsPage';
import EmailSenderSettingsPage from './pages/EmailSenderSettingsPage';
import UnmatchedRepliesPage from './pages/UnmatchedRepliesPage';
import AdAccountsPage from './pages/AdAccountsPage';
import CampaignsPage from './pages/CampaignsPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import BatchAnalysisPage from './pages/BatchAnalysisPage';
import PrivacyPolicyPage from './pages/PrivacyPolicyPage';
import TermsOfServicePage from './pages/TermsOfServicePage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <NotificationsProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
            <Route path="/terms-of-service" element={<TermsOfServicePage />} />

            {/* Protected: any authenticated user */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/invoices/new" element={<InvoiceBuilderPage />} />
              <Route path="/invoices/:id/edit" element={<InvoiceBuilderPage />} />
              <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/subscriptions" element={<SubscriptionsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/email/compose" element={<EmailComposePage />} />
              <Route path="/email/campaigns" element={<EmailCampaignsPage />} />
              {/* Ad analysis — gated in-page by the analyzeAds permission, owners always pass */}
              <Route path="/ad-accounts" element={<AdAccountsPage />} />
              <Route path="/campaigns" element={<CampaignsPage />} />
              <Route path="/campaigns/analyze-batch" element={<BatchAnalysisPage />} />
              <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
            </Route>

            {/* Owner-only routes */}
            <Route element={<ProtectedRoute allowedRoles={['owner']} />}>
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/staff" element={<StaffPage />} />
              <Route path="/email-templates" element={<EmailTemplatesPage />} />
              <Route path="/branding" element={<BrandingPage />} />
              <Route path="/ai-settings" element={<AiSettingsPage />} />
              <Route path="/email-sender-settings" element={<EmailSenderSettingsPage />} />
              <Route path="/email/unmatched" element={<UnmatchedRepliesPage />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </NotificationsProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
