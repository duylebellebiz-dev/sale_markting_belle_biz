import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { gmailApi, type GmailStatus } from '../features/email/gmailApi';
import { mailgunApi, type MailgunSettings } from '../features/businesses/mailgunApi';
import { savedEmailsApi } from '../features/businesses/savedEmailsApi';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailSenderSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Per-business Mailgun sender (own API key + sending domain) ─────────────
  const [mailgun, setMailgun] = useState<MailgunSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [domain, setDomain] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingMailgun, setSavingMailgun] = useState(false);
  const [clearingMailgun, setClearingMailgun] = useState(false);
  const [mailgunMsg, setMailgunMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // ── Saved CC/BCC quick-pick emails ─────────────────────────────────────────
  const [savedEmails, setSavedEmails] = useState<string[] | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [savingEmails, setSavingEmails] = useState(false);
  const [savedEmailsErr, setSavedEmailsErr] = useState<string | null>(null);

  function loadSavedEmails() {
    savedEmailsApi.list().then(setSavedEmails).catch(() => setSavedEmails([]));
  }

  async function persistSavedEmails(next: string[]) {
    setSavingEmails(true);
    setSavedEmailsErr(null);
    try {
      const res = await savedEmailsApi.update(next);
      setSavedEmails(res);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setSavedEmailsErr(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save.'));
    } finally {
      setSavingEmails(false);
    }
  }

  function handleAddSavedEmail(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    if (!EMAIL_RE.test(email)) { setSavedEmailsErr('Enter a valid email address.'); return; }
    if ((savedEmails ?? []).some((v) => v.toLowerCase() === email.toLowerCase())) {
      setSavedEmailsErr('That email is already saved.');
      return;
    }
    persistSavedEmails([...(savedEmails ?? []), email]);
    setNewEmail('');
  }

  function handleRemoveSavedEmail(email: string) {
    persistSavedEmails((savedEmails ?? []).filter((v) => v !== email));
  }

  function loadStatus() {
    gmailApi
      .getStatus()
      .then(setStatus)
      .catch(() => setLoadErr('Failed to load Gmail connection status.'));
  }

  function loadMailgunSettings() {
    mailgunApi
      .getSettings()
      .then((res) => {
        setMailgun(res);
        setDomain(res.domain);
        setFromEmail(res.fromEmail);
        setFromName(res.fromName);
      })
      .catch(() => setLoadErr('Failed to load Mailgun sender settings.'));
  }

  useEffect(() => {
    loadStatus();
    loadMailgunSettings();
    loadSavedEmails();

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

  async function handleSaveMailgun(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim() || !domain.trim() || !fromEmail.trim()) return;
    setSavingMailgun(true);
    setMailgunMsg(null);
    try {
      const res = await mailgunApi.setSettings({
        apiKey: apiKey.trim(),
        domain: domain.trim(),
        fromEmail: fromEmail.trim(),
        fromName: fromName.trim() || undefined,
      });
      setMailgun(res.data);
      setApiKey('');
      setMailgunMsg({ type: 'success', text: res.message });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMailgunMsg({ type: 'error', text: msg ?? 'Failed to save. Please try again.' });
    } finally {
      setSavingMailgun(false);
    }
  }

  async function handleClearMailgun() {
    setClearingMailgun(true);
    setMailgunMsg(null);
    try {
      const res = await mailgunApi.clearSettings();
      setMailgun(res.data);
      setDomain('');
      setFromEmail('');
      setFromName('');
      setMailgunMsg({ type: 'success', text: res.message });
    } catch {
      setMailgunMsg({ type: 'error', text: 'Failed to clear settings.' });
    } finally {
      setClearingMailgun(false);
    }
  }

  const connected = status?.status === 'connected';

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto py-10 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Email Settings</h1>
        <p className="text-sm text-gray-500 mb-8">
          Register your own Mailgun sender below so campaigns/invoices/reminders send from your own
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
          <h2 className="text-base font-semibold text-gray-800 mb-1">Your Mailgun Sender</h2>
          <p className="text-sm text-gray-500 mb-4">
            Register your own free Mailgun account (mailgun.com) and verify your own sending domain
            to send campaigns/invoices/reminders from your own address with your own quota. Leave
            unconfigured to use the platform's shared sender instead.
          </p>

          {mailgun === null ? (
            <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
          ) : (
            <div className="flex items-center gap-2 mb-5">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  mailgun.configured ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${mailgun.configured ? 'bg-green-500' : 'bg-amber-500'}`}
                />
                {mailgun.configured ? `Own sender configured: ${mailgun.fromEmail}` : 'Using shared sender'}
              </span>
            </div>
          )}

          <form onSubmit={handleSaveMailgun} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {mailgun?.configured ? 'Replace Mailgun API Key' : 'Mailgun API Key'}
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="key-xxxxxxxxxxxxxxxxxxxxxxxx"
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sending Domain (verified)</label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="mg.yourshop.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
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

            {mailgunMsg && (
              <p className={`text-sm font-medium ${mailgunMsg.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
                {mailgunMsg.text}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={savingMailgun || !apiKey.trim() || !domain.trim() || !fromEmail.trim()}
                className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {savingMailgun ? 'Saving…' : mailgun?.configured ? 'Update Sender' : 'Save Sender'}
              </button>
              {mailgun?.configured && (
                <button
                  type="button"
                  onClick={handleClearMailgun}
                  disabled={clearingMailgun}
                  className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {clearingMailgun ? 'Clearing…' : 'Use Shared Sender Instead'}
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Saved CC/BCC Emails</h2>
          <p className="text-sm text-gray-500 mb-4">
            Save frequently-used addresses (accounting, manager, ...) so anyone sending an invoice
            or email can add them with one click instead of retyping.
          </p>

          <form onSubmit={handleAddSavedEmail} className="flex gap-2 mb-4">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="accounting@yourshop.com"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={savingEmails || !newEmail.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </form>

          {savedEmailsErr && (
            <p className="text-sm text-red-600 mb-3">{savedEmailsErr}</p>
          )}

          {savedEmails === null ? (
            <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
          ) : savedEmails.length === 0 ? (
            <p className="text-sm text-gray-400">No saved emails yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {savedEmails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-2 rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-sm text-gray-700"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => handleRemoveSavedEmail(email)}
                    disabled={savingEmails}
                    className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                    title="Remove"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
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
            <li>Outbound campaigns, invoices, and reminders send from your own Mailgun sender if configured, otherwise the platform's shared sender.</li>
            <li>The Mailgun API key is encrypted before being stored, and is never shown again.</li>
            <li>Once Gmail is connected, the Reply-To on those emails points to your Gmail address.</li>
            <li>Customer replies appear in each customer's Email History tab as a two-way thread.</li>
            <li>Only the business owner can manage these settings.</li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
