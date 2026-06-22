import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { adsApi, type AdAccount, type AdConnection, type AdProvider } from '../features/ads/adsApi';
import { usePermission } from '../features/staff/usePermission';
import { useAuth } from '../context/AuthContext';
import { useStaff } from '../features/staff/useStaff';

// ── Provider metadata ──────────────────────────────────────────────────────────

const PROVIDERS: { id: AdProvider; label: string; color: string; icon: React.ReactNode }[] = [
  {
    id: 'facebook',
    label: 'Facebook Ads',
    color: 'bg-blue-600',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.884v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
      </svg>
    ),
  },
  {
    id: 'google',
    label: 'Google Ads',
    color: 'bg-red-500',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
];

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  active:       { label: 'Connected',    cls: 'bg-green-100 text-green-800' },
  disconnected: { label: 'Disconnected', cls: 'bg-amber-100 text-amber-800' },
  error:        { label: 'Error',        cls: 'bg-red-100 text-red-800' },
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdAccountsPage() {
  const canAnalyze = usePermission('analyzeAds');
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  // /users is owner-only — only owners get a teammate picker for sharing.
  // A non-owner connection owner can still see who an account is shared with and revoke it.
  const { staff: ownerStaffList } = useStaff();
  const staff = isOwner ? ownerStaffList : [];

  const [searchParams, setSearchParams] = useSearchParams();
  const [connections, setConnections] = useState<AdConnection[]>([]);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<AdProvider | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [conns, accs] = await Promise.all([adsApi.listConnections(), adsApi.listAccounts()]);
      setConnections(conns);
      setAccounts(accs);
    } catch {
      setError('Failed to load connected accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Read outcome from OAuth redirect query params
  useEffect(() => {
    const connected = searchParams.get('connected');
    const found = searchParams.get('found');
    const oauthError = searchParams.get('error');
    if (connected) {
      const label = connected === 'facebook' ? 'Facebook Ads' : 'Google Ads';
      const countMsg = found ? ` Found ${found} ad account${found === '1' ? '' : 's'}/fanpage${found === '1' ? '' : 's'}.` : '';
      setSuccessMsg(`${label} connected successfully.${countMsg}`);
      setSearchParams({}, { replace: true });
    } else if (oauthError) {
      setError(oauthError);
      setSearchParams({}, { replace: true });
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect(provider: AdProvider) {
    if (!canAnalyze) return;
    setConnecting(provider);
    setError(null);
    try {
      const { authUrl } = await adsApi.getConnectUrl(provider);
      // Open in same tab so the callback redirect lands back here naturally
      window.location.href = authUrl;
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to start authorization. Check that your app credentials are configured in the server .env file.';
      setError(msg);
      setConnecting(null);
    }
  }

  async function handleDisconnectConnection(id: string) {
    if (!canAnalyze) return;
    setDisconnecting(id);
    setError(null);
    try {
      await adsApi.disconnectConnection(id);
      await load();
    } catch {
      setError('Failed to disconnect.');
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleStopTracking(accountId: string) {
    setDisconnecting(accountId);
    setError(null);
    try {
      await adsApi.disconnect(accountId);
      await load();
    } catch {
      setError('Failed to stop tracking this account.');
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleShare(accountId: string, granteeUserId: string) {
    if (!granteeUserId) return;
    setError(null);
    try {
      await adsApi.shareAccount(accountId, granteeUserId);
      await load();
    } catch {
      setError('Failed to share this account.');
    }
  }

  async function handleRevoke(accountId: string, granteeUserId: string) {
    setError(null);
    try {
      await adsApi.revokeAccess(accountId, granteeUserId);
      await load();
    } catch {
      setError('Failed to revoke access.');
    }
  }

  const connectionByProvider = (provider: AdProvider) =>
    connections.find((c) => c.provider === provider);

  const myOwnAccountIds = new Set(
    accounts.filter((a) => a.connection.userId === user?.id).map((a) => a.id),
  );
  const canManageSharing = (account: AdAccount) => isOwner || account.connection.userId === user?.id;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto py-10 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Ad Accounts</h1>
        <p className="text-sm text-gray-500 mb-8">
          Connect Facebook/Google once — every fanpage or ad account that login can see is
          discovered automatically. Share a fanpage with teammates without them reconnecting.
        </p>

        {!canAnalyze && (
          <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-700">
            You don't have the <strong>analyzeAds</strong> permission. Ask your owner to enable it
            before connecting ad accounts.
          </div>
        )}

        {successMsg && (
          <div className="mb-5 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            {successMsg}
          </div>
        )}
        {error && (
          <div className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <p className="font-semibold mb-1">Developer app setup required</p>
          <p className="text-amber-700 leading-relaxed mb-2">
            Connecting live ad accounts requires a registered developer app on each platform and
            passing their App Review process — a one-time setup done by the technical administrator.
            After that, every staff member connects with their own login; nobody needs API keys.
          </p>
          <ul className="list-disc list-inside space-y-1 text-amber-700">
            <li>
              Set <code className="bg-amber-100 rounded px-1">FB_APP_ID</code>,{' '}
              <code className="bg-amber-100 rounded px-1">FB_APP_SECRET</code>,{' '}
              <code className="bg-amber-100 rounded px-1">GOOGLE_CLIENT_ID</code>,{' '}
              <code className="bg-amber-100 rounded px-1">GOOGLE_CLIENT_SECRET</code>, and{' '}
              <code className="bg-amber-100 rounded px-1">GOOGLE_ADS_DEVELOPER_TOKEN</code> in the
              server <code className="bg-amber-100 rounded px-1">.env</code> file.
            </li>
          </ul>
        </div>

        {/* ── Your OAuth connections ─────────────────────────────────────────── */}
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Your connections</h2>
        <div className="space-y-4 mb-8">
          {PROVIDERS.map(({ id, label, color, icon }) => {
            const connection = connectionByProvider(id);
            const statusInfo = connection ? STATUS_LABELS[connection.status] : null;
            const isConnecting = connecting === id;
            const isDisconnecting = disconnecting === connection?.id;

            return (
              <div
                key={id}
                className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 flex items-start gap-4"
              >
                <div className={`w-10 h-10 rounded-lg ${color} text-white flex items-center justify-center shrink-0`}>
                  {icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-gray-900 text-sm">{label}</p>
                    {statusInfo && (
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.cls}`}>
                        {statusInfo.label}
                      </span>
                    )}
                  </div>
                  {connection ? (
                    <>
                      <p className="text-xs text-gray-600">
                        {connection.adAccounts.length} ad account{connection.adAccounts.length === 1 ? '' : 's'} found
                      </p>
                      {connection.tokenExpiresAt && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Token expires: {new Date(connection.tokenExpiresAt).toLocaleDateString('en-CA')}
                        </p>
                      )}
                      {connection.status === 'disconnected' && (
                        <p className="text-xs text-amber-700 mt-1">Token expired — reconnect to resume syncing.</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-gray-400">Not connected</p>
                  )}
                </div>

                <div className="shrink-0 flex flex-col gap-2">
                  {connection && connection.status !== 'disconnected' ? (
                    <>
                      <button
                        onClick={() => handleConnect(id)}
                        disabled={!!connecting || !canAnalyze}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        {isConnecting ? 'Redirecting…' : 'Reconnect'}
                      </button>
                      <button
                        onClick={() => connection && handleDisconnectConnection(connection.id)}
                        disabled={!!disconnecting || !!connecting || !canAnalyze}
                        className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        {isDisconnecting ? 'Removing…' : 'Disconnect'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleConnect(id)}
                      disabled={!!connecting || loading || !canAnalyze}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {isConnecting ? 'Redirecting…' : connection ? 'Reconnect' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Ad accounts / fanpages visible to you ─────────────────────────── */}
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          {isOwner ? 'All ad accounts in your business' : 'Ad accounts visible to you'}
        </h2>
        {accounts.length === 0 && !loading && (
          <p className="text-sm text-gray-400 mb-8">No ad accounts yet — connect Facebook or Google above.</p>
        )}
        <div className="space-y-3 mb-8">
          {accounts.map((account) => {
            const statusInfo = STATUS_LABELS[account.status];
            const provider = PROVIDERS.find((p) => p.id === account.provider)!;
            const isMine = myOwnAccountIds.has(account.id);
            const canShare = canManageSharing(account);
            const candidateStaff = staff.filter(
              (s) => s.id !== account.connection.userId && !account.accessGrants.some((g) => g.userId === s.id),
            );

            return (
              <div key={account.id} className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg ${provider.color} text-white flex items-center justify-center shrink-0`}>
                    {provider.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 text-sm">{account.accountName || account.externalAccountId}</p>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.cls}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Connected by {isMine ? 'you' : account.connection.user.fullName || account.connection.user.email}
                    </p>
                    {account.accessGrants.length > 0 && (
                      <p className="text-xs text-gray-400 mt-1">
                        Shared with:{' '}
                        {account.accessGrants.map((g) => (
                          <span key={g.userId} className="inline-flex items-center gap-1 mr-2">
                            {g.user.fullName || g.user.email}
                            {canShare && (
                              <button
                                onClick={() => handleRevoke(account.id, g.userId)}
                                className="text-red-500 hover:underline"
                                title="Revoke access"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col gap-2 items-end">
                    {canShare && (
                      <button
                        onClick={() => setSharingId(sharingId === account.id ? null : account.id)}
                        className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Share
                      </button>
                    )}
                    {canShare && account.status !== 'disconnected' && (
                      <button
                        onClick={() => handleStopTracking(account.id)}
                        disabled={disconnecting === account.id}
                        className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {disconnecting === account.id ? 'Removing…' : 'Stop tracking'}
                      </button>
                    )}
                  </div>
                </div>

                {sharingId === account.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleShare(account.id, e.target.value);
                          setSharingId(null);
                        }
                      }}
                      className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 flex-1"
                    >
                      <option value="" disabled>Share with a teammate…</option>
                      {candidateStaff.map((s) => (
                        <option key={s.id} value={s.id}>{s.fullName || s.email}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        )}
      </div>
    </AppShell>
  );
}
