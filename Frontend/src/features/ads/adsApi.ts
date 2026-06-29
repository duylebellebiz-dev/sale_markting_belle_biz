import api from '../../lib/api';

export type AdProvider = 'facebook' | 'google';
export type AdAccountStatus = 'active' | 'disconnected' | 'error';

// One OAuth login. May expose many fanpages/ad accounts (see AdAccount below).
export interface AdConnection {
  id: string;
  provider: AdProvider;
  tokenExpiresAt: string | null;
  status: AdAccountStatus;
  createdAt: string;
  updatedAt: string;
  adAccounts: Array<{ id: string; accountName: string; externalAccountId: string; status: AdAccountStatus }>;
}

// One fanpage / ad account discovered under a connection. Visible to its connection's
// owner, anyone it's been explicitly shared with, and any business owner.
export interface AdAccount {
  id: string;
  provider: AdProvider;
  externalAccountId: string;
  accountName: string;
  status: AdAccountStatus;
  createdAt: string;
  updatedAt: string;
  connection: {
    userId: string;
    status: AdAccountStatus;
    tokenExpiresAt: string | null;
    user: { fullName: string; email: string };
  };
  accessGrants: Array<{ userId: string; user: { fullName: string; email: string } }>;
}

export interface CampaignMetric {
  id: string;
  campaignId: string;
  date: string;
  impressions: string;  // BigInt serialised as string
  clicks: string;
  ctr: number | null;
  spend: string | null;
  conversions: number | null;
  cpc: string | null;
  cpa: string | null;
  reach: string | null;
  roas: number | null;
}

export interface Campaign {
  id: string;
  businessId: string;
  adAccountId: string;
  provider: AdProvider;
  externalCampaignId: string;
  name: string;
  objective: string;
  status: string;
  creativeText: string;
  headline: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  adAccount: { provider: AdProvider; accountName: string; status: AdAccountStatus };
  metrics: CampaignMetric[];
}

export interface ImportPreviewRow {
  rowNumber: number;
  campaignName: string;
  date: string | null;
  impressions: string;
  clicks: string;
  spend: string | null;
  errors: string[];
  valid: boolean;
}

export interface ImportSummary {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

export interface SyncResult {
  campaignsUpserted: number;
  metricsUpserted: number;
  dateFrom: string;
  dateTo: string;
  rateLimited?: boolean;
  message?: string;
}

export interface AdChatMessage {
  id: string;
  campaignId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  createdBy?: { fullName: string; email: string } | null;
}

export interface AdAnalysis {
  id: string;
  businessId: string;
  campaignId: string;
  createdById: string | null;
  contentReview: string;
  performanceAnalysis: string;
  audienceAnalysis: string;
  recommendations: string[];
  model: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: { fullName: string; email: string } | null;
}

// Cross-campaign analysis result — compares several campaigns at once.
export interface AdBatchAnalysis {
  id: string;
  businessId: string;
  campaignIds: string[];
  createdById: string | null;
  contentReview: string;
  performanceAnalysis: string;
  audienceAnalysis: string;
  recommendations: string[];
  model: string;
  createdAt: string;
  createdBy?: { fullName: string; email: string } | null;
}

export interface AdBatchChatMessage {
  id: string;
  batchAnalysisId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  createdBy?: { fullName: string; email: string } | null;
}

// Deep keyword / audience analysis (Google keywords + search terms; FB & Google targeting + demographics)
export interface CampaignKeyword {
  id: string;
  text: string;
  matchType: string;
  status: string;
  impressions: string;
  clicks: string;
  spend: string | null;
  ctr: number | null;
}

export interface CampaignSearchTerm {
  id: string;
  term: string;
  impressions: string;
  clicks: string;
  spend: string | null;
}

export interface CampaignTargeting {
  id: string;
  provider: AdProvider;
  ageRanges: string[];
  genders: string[];
  locations: string[];
  interests: Array<{ id: string; name: string }>;
  languages: string[];
}

export interface CampaignDemographic {
  id: string;
  ageRange: string;
  gender: string;
  region: string;
  impressions: string;
  clicks: string;
  spend: string | null;
  conversions: number | null;
}

export interface CampaignAudienceData {
  keywords: CampaignKeyword[];
  searchTerms: CampaignSearchTerm[];
  targeting: CampaignTargeting | null;
  demographics: CampaignDemographic[];
}

const d = <T>(res: { data: T }) => res.data;

const BACKEND = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

async function downloadBlob(url: string, filename: string) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BACKEND}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export const adsApi = {
  // OAuth connections (one login → possibly many fanpages/ad accounts)
  listConnections: () =>
    api.get<AdConnection[]>('/ads/connections').then(d<AdConnection[]>),
  disconnectConnection: (id: string) => api.delete(`/ads/connections/${id}`),
  getConnectUrl: (provider: AdProvider) =>
    api.get<{ authUrl: string }>(`/ads/connect/${provider}`).then(d<{ authUrl: string }>),

  // Ad accounts (fanpages) visible to the current user
  listAccounts: () =>
    api.get<AdAccount[]>('/ads/accounts').then(d<AdAccount[]>),
  disconnect: (id: string) => api.delete(`/ads/accounts/${id}`),

  // Sharing one fanpage with a teammate (owner or the connecting staff member only)
  shareAccount: (adAccountId: string, userId: string) =>
    api.post(`/ads/accounts/${adAccountId}/share`, { userId }),
  revokeAccess: (adAccountId: string, userId: string) =>
    api.delete(`/ads/accounts/${adAccountId}/share/${userId}`),

  // Sync — statusFilter 'active_paused' (default) skips ended/archived/deleted campaigns;
  // dateFrom/dateTo (YYYY-MM-DD, both together) scope the sync to one reporting period
  // (e.g. "this month") instead of the default incremental window; limit caps it to the
  // N most recently created campaigns. All three cut sync time/requests for accounts
  // with many campaigns, which is what trips Facebook's rate limit.
  sync: (adAccountId: string, params?: { statusFilter?: 'active_paused' | 'all'; dateFrom?: string; dateTo?: string; limit?: number }) =>
    api.post<SyncResult>(`/ads/sync/${adAccountId}`, undefined, { params: params ?? {} }).then(d<SyncResult>),

  // Campaigns — dateFrom/dateTo (YYYY-MM-DD, both together) select a reporting period;
  // omit both to get the default "last 30 synced days" view. limit caps the list to the
  // N most recently synced campaigns (matches the sync-time limit, if any).
  listCampaigns: (params?: { adAccountId?: string; dateFrom?: string; dateTo?: string; limit?: number }) =>
    api.get<Campaign[]>('/ads/campaigns', { params: params ?? {} }).then(d<Campaign[]>),

  downloadCampaignsXlsx: (params?: { adAccountId?: string; dateFrom?: string; dateTo?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string> ?? {}).toString();
    return downloadBlob(`/ads/campaigns/export.xlsx${qs ? `?${qs}` : ''}`, 'campaigns-report.xlsx');
  },

  // AI analysis
  analyzeCampaign: (campaignId: string) =>
    api.post<AdAnalysis>(`/ads/campaigns/${campaignId}/analyze`).then(d<AdAnalysis>),
  listAnalyses: (campaignId: string) =>
    api.get<AdAnalysis[]>(`/ads/campaigns/${campaignId}/analyses`).then(d<AdAnalysis[]>),
  deleteAnalysis: (campaignId: string, analysisId: string) =>
    api.delete(`/ads/campaigns/${campaignId}/analyses/${analysisId}`),

  // Free-form AI chat about a campaign — ask anything, in any language
  listChatMessages: (campaignId: string) =>
    api.get<AdChatMessage[]>(`/ads/campaigns/${campaignId}/chat`).then(d<AdChatMessage[]>),
  sendChatMessage: (campaignId: string, message: string) =>
    api.post<{ userMessage: AdChatMessage; assistantMessage: AdChatMessage }>(
      `/ads/campaigns/${campaignId}/chat`,
      { message },
    ).then(d<{ userMessage: AdChatMessage; assistantMessage: AdChatMessage }>),
  clearChatHistory: (campaignId: string) => api.delete(`/ads/campaigns/${campaignId}/chat`),

  // Cross-campaign analysis — compare several campaigns at once
  analyzeBatch: (campaignIds: string[]) =>
    api.post<AdBatchAnalysis>('/ads/campaigns/analyze-batch', { campaignIds }).then(d<AdBatchAnalysis>),
  listBatchAnalyses: () =>
    api.get<AdBatchAnalysis[]>('/ads/batch-analyses').then(d<AdBatchAnalysis[]>),
  deleteBatchAnalysis: (id: string) => api.delete(`/ads/batch-analyses/${id}`),
  listBatchChatMessages: (batchAnalysisId: string) =>
    api.get<AdBatchChatMessage[]>(`/ads/batch-analyses/${batchAnalysisId}/chat`).then(d<AdBatchChatMessage[]>),
  sendBatchChatMessage: (batchAnalysisId: string, message: string) =>
    api.post<{ userMessage: AdBatchChatMessage; assistantMessage: AdBatchChatMessage }>(
      `/ads/batch-analyses/${batchAnalysisId}/chat`,
      { message },
    ).then(d<{ userMessage: AdBatchChatMessage; assistantMessage: AdBatchChatMessage }>),
  clearBatchChatHistory: (batchAnalysisId: string) =>
    api.delete(`/ads/batch-analyses/${batchAnalysisId}/chat`),

  // Deep audience/keyword data for one campaign
  getAudience: (campaignId: string) =>
    api.get<CampaignAudienceData>(`/ads/campaigns/${campaignId}/audience`).then(d<CampaignAudienceData>),

  // Report downloads
  downloadReportPdf: (campaignId: string, filename: string) =>
    downloadBlob(`/ads/campaigns/${campaignId}/report.pdf`, filename),
  downloadReportXlsx: (campaignId: string, filename: string) =>
    downloadBlob(`/ads/campaigns/${campaignId}/report.xlsx`, filename),

  // CSV/Excel import
  downloadTemplate: (provider: AdProvider) => {
    const base = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';
    window.open(`${base}/ads/import/template/${provider}`, '_blank');
  },

  previewImport: (provider: AdProvider, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<{ rows: ImportPreviewRow[]; warnings: string[] }>(`/ads/import/preview/${provider}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(d<{ rows: ImportPreviewRow[]; warnings: string[] }>);
  },

  commitImport: (provider: AdProvider, file: File, adAccountId: string) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<ImportSummary>(`/ads/import/commit/${provider}?adAccountId=${adAccountId}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(d<ImportSummary>);
  },
};
