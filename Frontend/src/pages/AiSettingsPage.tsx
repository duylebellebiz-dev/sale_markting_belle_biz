import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { businessesApi } from '../features/businesses/businessesApi';

export default function AiSettingsPage() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    businessesApi
      .getClaudeKeyStatus()
      .then((res) => setConfigured(res.configured))
      .catch(() => setLoadErr('Failed to load settings.'));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await businessesApi.setClaudeApiKey(apiKey.trim());
      setConfigured(true);
      setApiKey('');
      setSaveMsg({ type: 'success', text: 'Claude API key saved successfully.' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSaveMsg({ type: 'error', text: msg ?? 'Failed to save. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto py-10 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">AI Settings</h1>
        <p className="text-sm text-gray-500 mb-8">
          Configure the Claude API key used for AI-powered ad campaign analysis. The key is stored
          encrypted and is never sent to the browser after saving.
        </p>

        {loadErr && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-6">
            {loadErr}
          </div>
        )}

        {/* Status card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 mb-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800 mb-1">Claude API Key</h2>
          <p className="text-sm text-gray-500 mb-4">
            Get your key from{' '}
            <span className="font-medium text-gray-700">console.anthropic.com</span>. One shared key
            is used for all AI analyses in your account. Staff with the{' '}
            <span className="font-medium">"Analyze Ad Campaigns"</span> permission can trigger
            analyses, but they never see the key itself.
          </p>

          {configured === null ? (
            <div className="h-6 w-40 bg-gray-100 rounded animate-pulse" />
          ) : (
            <div className="flex items-center gap-2 mb-5">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                  configured
                    ? 'bg-green-100 text-green-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${configured ? 'bg-green-500' : 'bg-amber-500'}`}
                />
                {configured ? 'Key configured' : 'No key set'}
              </span>
              {configured && (
                <span className="text-xs text-gray-400">
                  Stored encrypted — enter a new key below to replace it.
                </span>
              )}
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {configured ? 'Replace API Key' : 'Enter API Key'}
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-api03-…"
                  className="w-full pr-20 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {saveMsg && (
              <p
                className={`text-sm font-medium ${
                  saveMsg.type === 'success' ? 'text-green-700' : 'text-red-600'
                }`}
              >
                {saveMsg.text}
              </p>
            )}

            <button
              type="submit"
              disabled={saving || !apiKey.trim()}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : configured ? 'Update Key' : 'Save Key'}
            </button>
          </form>
        </div>

        {/* Info box */}
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-800 space-y-1">
          <p className="font-semibold mb-1">How it works</p>
          <ul className="list-disc list-inside space-y-1 text-blue-700">
            <li>The key is encrypted (AES-256-GCM) before being stored in the database.</li>
            <li>All Claude API calls happen server-side — the key is never sent to the browser.</li>
            <li>Staff can only trigger analyses if you grant them the <strong>Analyze Ad Campaigns</strong> permission in Staff settings.</li>
            <li>Recommended model: <code className="bg-blue-100 rounded px-1">claude-sonnet-4-6</code> (balances cost and quality).</li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
