import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { businessesApi } from '../features/businesses/businessesApi';

export default function EmailSenderSettingsPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [host, setHost] = useState('');
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [fromName, setFromName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    businessesApi
      .getSmtpSettings()
      .then((res) => {
        setConfigured(res.configured);
        setHost(res.smtpHost);
        setPort(res.smtpPort || 587);
        setSecure(res.smtpSecure);
        setUser(res.smtpUser);
        setFromName(res.smtpFromName);
      })
      .catch(() => setLoadErr('Failed to load settings.'));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!host.trim() || !user.trim() || !password.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await businessesApi.setSmtpSettings({
        host: host.trim(),
        port,
        secure,
        user: user.trim(),
        password,
        fromName: fromName.trim() || undefined,
      });
      setConfigured(true);
      setPassword('');
      setSaveMsg({ type: 'success', text: res.message });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSaveMsg({ type: 'error', text: msg ?? 'Failed to save. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    setSaveMsg(null);
    try {
      const res = await businessesApi.clearSmtpSettings();
      setConfigured(false);
      setHost('');
      setUser('');
      setFromName('');
      setPort(587);
      setSecure(false);
      setSaveMsg({ type: 'success', text: res.message });
    } catch {
      setSaveMsg({ type: 'error', text: 'Failed to clear settings.' });
    } finally {
      setClearing(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto py-10 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Email Sender Settings</h1>
        <p className="text-sm text-gray-500 mb-8">
          Send campaigns from your own mailbox instead of the shared sender. Once configured, every
          email truly comes "from" your address. Leave unconfigured to keep using the default sender.
        </p>

        {loadErr && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-6">
            {loadErr}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Your Mailbox (SMTP)</h2>
          <p className="text-sm text-gray-500 mb-4">
            For Gmail: host <code className="bg-gray-100 rounded px-1">smtp.gmail.com</code>, port{' '}
            <code className="bg-gray-100 rounded px-1">587</code>, and an{' '}
            <span className="font-medium text-gray-700">App Password</span> (not your normal Gmail
            password) — generate one at myaccount.google.com/apppasswords.
          </p>

          {configured === null ? (
            <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
          ) : (
            <div className="flex items-center gap-2 mb-5">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  configured ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${configured ? 'bg-green-500' : 'bg-amber-500'}`} />
                {configured ? 'Custom sender configured' : 'Using default sender'}
              </span>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="smtp.gmail.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Email Address</label>
              <input
                type="email"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="you@yourshop.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {configured ? 'Replace App Password' : 'App Password'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full pr-20 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Name (optional)</label>
              <input
                type="text"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Your Shop Name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
              Use SSL/TLS (port 465 typically requires this checked)
            </label>

            {saveMsg && (
              <p className={`text-sm font-medium ${saveMsg.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
                {saveMsg.text}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving || !host.trim() || !user.trim() || !password.trim()}
                className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : configured ? 'Update Sender' : 'Save Sender'}
              </button>
              {configured && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={clearing}
                  className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {clearing ? 'Clearing…' : 'Use Default Sender Instead'}
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-800 space-y-1">
          <p className="font-semibold mb-1">How it works</p>
          <ul className="list-disc list-inside space-y-1 text-blue-700">
            <li>The app password is encrypted (AES-256-GCM) before being stored.</li>
            <li>Once configured, every campaign sends "from" your own address — no domain verification needed.</li>
            <li>Leave unconfigured (or click "Use Default Sender Instead") to fall back to the shared sender.</li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
