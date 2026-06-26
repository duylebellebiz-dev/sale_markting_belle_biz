import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { gmailApi, type GmailStatus } from '../features/email/gmailApi';
import { resendApi, type ResendSettings } from '../features/businesses/resendApi';

export default function EmailSenderSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Per-business Resend sender (own API key + verified domain) ─────────────
  const [resend, setResend] = useState<ResendSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingResend, setSavingResend] = useState(false);
  const [clearingResend, setClearingResend] = useState(false);
  const [resendMsg, setResendMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  function loadStatus() {
    gmailApi
      .getStatus()
      .then(setStatus)
      .catch(() => setLoadErr('Failed to load Gmail connection status.'));
  }

  function loadResendSettings() {
    resendApi
      .getSettings()
      .then((res) => {
        setResend(res);
        setFromEmail(res.fromEmail);
        setFromName(res.fromName);
      })
      .catch(() => setLoadErr('Failed to load Resend sender settings.'));
  }

  useEffect(() => {
    loadStatus();
    loadResendSettings();

    const error = searchParams.get('error');
    const connected = searchParams.get('connected');
    const email = searchParams.get('email');
    if (error) {
      setBanner({ type: 'error', text: error });
    } else if (connected === 'gmail') {
      setBanner({ type: 'success', text: `Gmail connected: ${email ?? ''}` });
    }
    if (error || connected) {
      searchParams.delete('error');
      searchParams.delete('connected');
      searchParams.delete('email');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect() {
    setConnecting(true);
    setBanner(null);
    try {
      const { authUrl } = await gmailApi.getConnectUrl();
      window.location.href = authUrl;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setBanner({ type: 'error', text: msg ?? 'Failed to start Gmail connection.' });
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setBanner(null);
    try {
      const res = await gmailApi.disconnect();
      setBanner({ type: 'success', text: res.message });
      loadStatus();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setBanner({ type: 'error', text: msg ?? 'Failed to disconnect Gmail.' });
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleSaveResend(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim() || !fromEmail.trim()) return;
    setSavingResend(true);
    setResendMsg(null);
    try {
      const res = await resendApi.setSettings({
        apiKey: apiKey.trim(),
        fromEmail: fromEmail.trim(),
        fromName: fromName.trim() || undefined,
      });
      setResend(res.data);
      setApiKey('');
      setResendMsg({ type: 'success', text: res.message });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setResendMsg({ type: 'error', text: msg ?? 'Failed to save. Please try again.' });
    } finally {
      setSavingResend(false);
    }
  }

  async function handleClearResend() {
    setClearingResend(true);
    setResendMsg(null);
    try {
      const res = await resendApi.clearSettings();
      setResend(res.data);
      setFromEmail('');
      setFromName('');
      setResendMsg({ type: 'success', text: res.message });
    } catch {
      setResendMsg({ type: 'error', text: 'Failed to clear settings.' });
    } finally {
      setClearingResend(false);
    }
  }

  const connected = status?.status === 'connected';

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto py-10 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Email Settings</h1>
        <p className="text-sm text-gray-500 mb-8">
          Register your own Resend sender below so campaigns/invoices/reminders send from your own
          address and quota. Then connect Gmail to enable two-way replies — when a customer
          replies, it lands in your Gmail inbox and shows up here as a conversation.
        </p>

        {loadErr && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-6">
            {loadErr}
          </div>
        )}

        {banner && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm mb-6 ${
              banner.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {banner.text}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Your Resend Sender</h2>
          <p className="text-sm text-gray-500 mb-4">
            Register your own free Resend account (resend.com) and verify your own domain to send
            campaigns/invoices/reminders from your own address with your own quota. Leave
            unconfigured to use the platform's shared sender instead.
          </p>

          {resend === null ? (
            <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
          ) : (
            <div className="flex items-center gap-2 mb-5">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  resend.configured ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${resend.configured ? 'bg-green-500' : 'bg-amber-500'}`}
                />
                {resend.configured ? `Own sender configured: ${resend.fromEmail}` : 'Using shared sender'}
              </span>
            </div>
          )}

          <form onSubmit={handleSaveResend} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {resend?.configured ? 'Replace Resend API Key' : 'Resend API Key'}
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full pr-20 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1"
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Email (verified)</label>
                <input
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="noreply@yourshop.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Name (optional)</label>
                <input
                  type="text"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  placeholder="Your Shop Name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {resendMsg && (
              <p className={`text-sm font-medium ${resendMsg.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
                {resendMsg.text}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={savingResend || !apiKey.trim() || !fromEmail.trim()}
                className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {savingResend ? 'Saving…' : resend?.configured ? 'Update Sender' : 'Save Sender'}
              </button>
              {resend?.configured && (
                <button
                  type="button"
                  onClick={handleClearResend}
                  disabled={clearingResend}
                  className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {clearingResend ? 'Clearing…' : 'Use Shared Sender Instead'}
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Gmail (two-way conversation)</h2>
          <p className="text-sm text-gray-500 mb-4">
            Connect one Gmail mailbox for this business. Customer replies to any outbound email will
            arrive here — never used for bulk or campaign sending.
          </p>

          {status === null ? (
            <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
          ) : (
            <div className="flex items-center gap-2 mb-5">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  connected ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-amber-500'}`} />
                {connected ? `Connected: ${status.emailAddress}` : 'Not connected'}
              </span>
            </div>
          )}

          <div className="flex gap-3">
            {!connected ? (
              <button
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {connecting ? 'Redirecting…' : 'Connect Gmail'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect Gmail'}
              </button>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-800 space-y-1">
          <p className="font-semibold mb-1">How it works</p>
          <ul className="list-disc list-inside space-y-1 text-blue-700">
            <li>Outbound campaigns, invoices, and reminders send from your own Resend sender if configured, otherwise the platform's shared sender.</li>
            <li>The Resend API key is encrypted before being stored, and is never shown again.</li>
            <li>Once Gmail is connected, the Reply-To on those emails points to your Gmail address.</li>
            <li>Customer replies appear in each customer's Email History tab as a two-way thread.</li>
            <li>Only the business owner can manage these settings.</li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
