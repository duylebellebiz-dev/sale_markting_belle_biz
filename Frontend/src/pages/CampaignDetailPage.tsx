import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { adsApi, type AdAnalysis, type AdChatMessage, type Campaign, type CampaignAudienceData } from '../features/ads/adsApi';
import { aggregateMetrics, fmt, fmtMoney, fmtPct, PROVIDER_LABELS, statusCls } from '../features/ads/adsHelpers';
import { usePermission } from '../features/staff/usePermission';

function extractMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
}

// ── Analysis result block (shared by latest result + history entries) ──────────

function AnalysisResult({ analysis }: { analysis: AdAnalysis }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Content Review</h4>
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{analysis.contentReview || '—'}</p>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Performance Analysis</h4>
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{analysis.performanceAnalysis || '—'}</p>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Audience / Keyword Analysis</h4>
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{analysis.audienceAnalysis || '—'}</p>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Recommendations</h4>
        {analysis.recommendations.length ? (
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-800">
            {analysis.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">—</p>
        )}
      </div>
    </div>
  );
}

// ── Audience / keyword data panel ───────────────────────────────────────────

function AudiencePanel({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<CampaignAudienceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adsApi.getAudience(campaignId)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 mb-6">
        <p className="text-xs text-gray-400 text-center py-4">Loading audience data…</p>
      </div>
    );
  }

  const hasKeywords = !!data?.keywords.length;
  const hasSearchTerms = !!data?.searchTerms.length;
  const hasTargeting = !!data?.targeting;
  const hasDemographics = !!data?.demographics.length;

  if (!hasKeywords && !hasSearchTerms && !hasTargeting && !hasDemographics) {
    return null; // nothing synced yet — don't clutter the page
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 mb-6 space-y-5">
      <h2 className="text-sm font-semibold text-gray-800">Audience &amp; Keywords (tệp khách hàng)</h2>

      {hasTargeting && data!.targeting && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Targeting</h3>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700">
            {data!.targeting.ageRanges.length > 0 && <span><strong>Age:</strong> {data!.targeting.ageRanges.join(', ')}</span>}
            {data!.targeting.genders.length > 0 && <span><strong>Gender:</strong> {data!.targeting.genders.join(', ')}</span>}
            {data!.targeting.locations.length > 0 && <span><strong>Locations:</strong> {data!.targeting.locations.join(', ')}</span>}
            {data!.targeting.languages.length > 0 && <span><strong>Languages:</strong> {data!.targeting.languages.join(', ')}</span>}
          </div>
          {data!.targeting.interests.length > 0 && (
            <p className="text-sm text-gray-700 mt-1"><strong>Interests:</strong> {data!.targeting.interests.map((i) => i.name).join(', ')}</p>
          )}
        </div>
      )}

      {hasDemographics && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Performance by Segment</h3>
          <div className="overflow-x-auto max-h-64">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-gray-400">
                  {['Age', 'Gender', 'Region', 'Impr.', 'Clicks', 'Spend', 'Conv.'].map((h) => (
                    <th key={h} className="px-2 py-1 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data!.demographics.map((row) => (
                  <tr key={row.id} className="text-gray-600">
                    <td className="px-2 py-1 whitespace-nowrap">{row.ageRange || '—'}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{row.gender || '—'}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{row.region || '—'}</td>
                    <td className="px-2 py-1">{fmt(Number(row.impressions), 0)}</td>
                    <td className="px-2 py-1">{fmt(Number(row.clicks), 0)}</td>
                    <td className="px-2 py-1">{fmtMoney(row.spend)}</td>
                    <td className="px-2 py-1">{fmt(row.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasKeywords && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Keywords</h3>
          <div className="overflow-x-auto max-h-64">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-gray-400">
                  {['Keyword', 'Match', 'Status', 'Impr.', 'Clicks', 'CTR', 'Spend'].map((h) => (
                    <th key={h} className="px-2 py-1 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data!.keywords.map((k) => (
                  <tr key={k.id} className="text-gray-600">
                    <td className="px-2 py-1 whitespace-nowrap font-medium text-gray-800">{k.text}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{k.matchType || '—'}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{k.status || '—'}</td>
                    <td className="px-2 py-1">{fmt(Number(k.impressions), 0)}</td>
                    <td className="px-2 py-1">{fmt(Number(k.clicks), 0)}</td>
                    <td className="px-2 py-1">{fmtPct(k.ctr)}</td>
                    <td className="px-2 py-1">{fmtMoney(k.spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasSearchTerms && (
        <details>
          <summary className="text-xs text-indigo-600 cursor-pointer hover:text-indigo-800 select-none">
            Search terms that triggered this ad ({data!.searchTerms.length})
          </summary>
          <div className="mt-2 overflow-x-auto max-h-64">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-gray-400">
                  {['Search term', 'Impr.', 'Clicks', 'Spend'].map((h) => (
                    <th key={h} className="px-2 py-1 text-left font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data!.searchTerms.map((s) => (
                  <tr key={s.id} className="text-gray-600">
                    <td className="px-2 py-1 font-medium text-gray-800">{s.term}</td>
                    <td className="px-2 py-1">{fmt(Number(s.impressions), 0)}</td>
                    <td className="px-2 py-1">{fmt(Number(s.clicks), 0)}</td>
                    <td className="px-2 py-1">{fmtMoney(s.spend)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

// ── AI Chat panel ────────────────────────────────────────────────────────────

function ChatPanel({ campaignId, canAnalyze }: { campaignId: string; canAnalyze: boolean }) {
  const [messages, setMessages] = useState<AdChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adsApi.listChatMessages(campaignId)
      .then((msgs) => { if (!cancelled) setMessages(msgs); })
      .catch(() => { if (!cancelled) setError('Failed to load chat history.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending || !canAnalyze) return;
    setSending(true);
    setError(null);
    setInput('');
    try {
      const { userMessage, assistantMessage } = await adsApi.sendChatMessage(campaignId, text);
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
    } catch (err) {
      setError(extractMsg(err, 'AI chat failed. Check that a Claude API key is configured in AI Settings.'));
      setInput(text); // give the message back so the user doesn't lose it
    } finally {
      setSending(false);
    }
  }

  async function handleClear() {
    if (!canAnalyze || clearing || !messages.length) return;
    if (!window.confirm('Clear the entire chat history for this campaign? This cannot be undone.')) return;
    setClearing(true);
    setError(null);
    try {
      await adsApi.clearChatHistory(campaignId);
      setMessages([]);
    } catch {
      setError('Failed to clear chat history.');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold text-gray-800">Ask AI about this campaign</h2>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            disabled={!canAnalyze || clearing}
            className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50 shrink-0"
          >
            {clearing ? 'Clearing…' : 'Clear chat'}
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Hỏi tự do bằng tiếng Việt, English, hoặc ngôn ngữ khác — ví dụ "nội dung này nên viết gì?" hoặc "what should I improve here?"
      </p>

      {!canAnalyze && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          You don't have the <strong>analyzeAds</strong> permission to use this chat.
        </div>
      )}

      <div className="border border-gray-100 rounded-lg max-h-96 overflow-y-auto p-3 mb-3 bg-gray-50/50">
        {loading && <p className="text-xs text-gray-400 text-center py-6">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6 italic">
            No questions yet — ask something below.
          </p>
        )}
        <div className="space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                {m.content}
                {m.role === 'user' && m.createdBy && (
                  <p className="text-[10px] text-indigo-200 mt-1">{m.createdBy.fullName || m.createdBy.email}</p>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-400 italic">
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          disabled={!canAnalyze || sending}
          placeholder="Hỏi bất cứ điều gì về campaign này…"
          rows={2}
          className="flex-1 resize-none rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!canAnalyze || sending || !input.trim()}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors self-end"
        >
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canAnalyze = usePermission('analyzeAds');

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [analyses, setAnalyses] = useState<AdAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<'pdf' | 'xlsx' | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deletingAnalysisId, setDeletingAnalysisId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [campaigns, history] = await Promise.all([
        adsApi.listCampaigns(),
        adsApi.listAnalyses(id),
      ]);
      const found = campaigns.find((c) => c.id === id) ?? null;
      setCampaign(found);
      setAnalyses(history);
      if (!found) setLoadError('Campaign not found.');
    } catch (err) {
      setLoadError(extractMsg(err, 'Failed to load campaign.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleAnalyze() {
    if (!id || !canAnalyze) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const result = await adsApi.analyzeCampaign(id);
      setAnalyses((prev) => [result, ...prev]);
    } catch (err) {
      setAnalyzeError(extractMsg(err, 'AI analysis failed. Check that a Claude API key is configured in AI Settings.'));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleDeleteAnalysis(analysisId: string) {
    if (!id || !canAnalyze || deletingAnalysisId) return;
    if (!window.confirm('Delete this analysis report? This cannot be undone.')) return;
    setDeletingAnalysisId(analysisId);
    setAnalyzeError(null);
    try {
      await adsApi.deleteAnalysis(id, analysisId);
      setAnalyses((prev) => prev.filter((a) => a.id !== analysisId));
    } catch {
      setAnalyzeError('Failed to delete this analysis report.');
    } finally {
      setDeletingAnalysisId(null);
    }
  }

  async function handleDownload(kind: 'pdf' | 'xlsx') {
    if (!id || !campaign || !canAnalyze) return;
    setDownloading(kind);
    setDownloadError(null);
    const slug = campaign.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    try {
      if (kind === 'pdf') {
        await adsApi.downloadReportPdf(id, `campaign-report-${slug}.pdf`);
      } else {
        await adsApi.downloadReportXlsx(id, `campaign-report-${slug}.xlsx`);
      }
    } catch {
      setDownloadError(`Failed to download the ${kind.toUpperCase()} report.`);
    } finally {
      setDownloading(null);
    }
  }

  const agg = campaign ? aggregateMetrics(campaign.metrics) : null;
  const latest = analyses[0] ?? null;
  const olderHistory = analyses.slice(1);

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto py-10 px-4">
        <Link to="/campaigns" className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline">
          ← Back to Campaigns
        </Link>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        )}

        {!loading && loadError && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        )}

        {!loading && campaign && (
          <>
            {/* Header */}
            <div className="mt-4 mb-6">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusCls(campaign.status)}`}>
                  {campaign.status || 'Unknown'}
                </span>
                <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
                  {PROVIDER_LABELS[campaign.provider]}
                </span>
              </div>
              <p className="text-sm text-gray-500">{campaign.objective || 'No objective set'}</p>
              {(campaign.startDate || campaign.endDate) && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {campaign.startDate ? campaign.startDate.slice(0, 10) : '?'} →{' '}
                  {campaign.endDate ? campaign.endDate.slice(0, 10) : 'ongoing'}
                </p>
              )}
            </div>

            {/* Creative content */}
            {(campaign.headline || campaign.creativeText) && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 mb-6">
                <h2 className="text-sm font-semibold text-gray-800 mb-2">Ad Content</h2>
                {campaign.headline && (
                  <p className="text-sm font-medium text-gray-900 mb-1">{campaign.headline}</p>
                )}
                {campaign.creativeText && (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{campaign.creativeText}</p>
                )}
              </div>
            )}

            {/* Metrics */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 mb-6">
              <h2 className="text-sm font-semibold text-gray-800 mb-3">Metrics</h2>
              {agg ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  {[
                    { label: 'Impressions', value: fmt(Number(agg.impressions), 0) },
                    { label: 'Clicks',      value: fmt(Number(agg.clicks), 0) },
                    { label: 'CTR',         value: fmtPct(agg.ctr) },
                    { label: 'Spend',       value: `$${agg.spend.toFixed(2)}` },
                    { label: 'Conv.',       value: fmt(agg.conversions, 0) },
                    { label: 'CPC',         value: agg.cpc != null ? `$${agg.cpc.toFixed(2)}` : '—' },
                    { label: 'ROAS',        value: agg.roas != null ? `${agg.roas.toFixed(2)}×` : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-lg p-2.5 text-center">
                      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                      <p className="text-sm font-semibold text-gray-800">{value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">No metrics synced yet</p>
              )}

              {campaign.metrics.length > 0 && (
                <details className="mt-4">
                  <summary className="text-xs text-indigo-600 cursor-pointer hover:text-indigo-800 select-none">
                    Daily breakdown ({campaign.metrics.length} days)
                  </summary>
                  <div className="mt-2 overflow-x-auto max-h-72">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-white">
                        <tr className="text-gray-400">
                          {['Date', 'Impr.', 'Clicks', 'CTR', 'Spend', 'Conv.', 'ROAS'].map((h) => (
                            <th key={h} className="px-2 py-1 text-left font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {campaign.metrics.map((m) => (
                          <tr key={m.id} className="text-gray-600">
                            <td className="px-2 py-1 whitespace-nowrap">{m.date.slice(0, 10)}</td>
                            <td className="px-2 py-1">{fmt(Number(m.impressions), 0)}</td>
                            <td className="px-2 py-1">{fmt(Number(m.clicks), 0)}</td>
                            <td className="px-2 py-1">{fmtPct(m.ctr)}</td>
                            <td className="px-2 py-1">{fmtMoney(m.spend)}</td>
                            <td className="px-2 py-1">{fmt(m.conversions)}</td>
                            <td className="px-2 py-1">{m.roas != null ? `${m.roas.toFixed(2)}×` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>

            {/* Audience / keyword data */}
            <AudiencePanel campaignId={campaign.id} />

            {/* AI Analysis */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 mb-6">
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <h2 className="text-sm font-semibold text-gray-800">AI Analysis</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDownload('pdf')}
                    disabled={!canAnalyze || downloading !== null}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {downloading === 'pdf' ? 'Downloading…' : 'Download PDF'}
                  </button>
                  <button
                    onClick={() => handleDownload('xlsx')}
                    disabled={!canAnalyze || downloading !== null}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {downloading === 'xlsx' ? 'Downloading…' : 'Download Excel'}
                  </button>
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing || !canAnalyze}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {analyzing ? 'Analyzing…' : latest ? 'Re-run Analysis' : 'Run AI Analysis'}
                  </button>
                </div>
              </div>

              {downloadError && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {downloadError}
                </div>
              )}

              {!canAnalyze && (
                <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                  You don't have the <strong>analyzeAds</strong> permission. Ask your owner to enable it
                  to run AI analysis.
                </div>
              )}

              {analyzeError && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {analyzeError}
                </div>
              )}

              {!latest && !analyzing && (
                <p className="text-sm text-gray-400 italic">
                  No analysis yet. Run AI analysis to get a content review, performance breakdown, and
                  recommendations for this campaign.
                </p>
              )}

              {latest && (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <p className="text-xs text-gray-400">
                      Latest — {fmtDateTime(latest.createdAt)} · model {latest.model}
                      {latest.createdBy ? ` · by ${latest.createdBy.fullName || latest.createdBy.email}` : ''}
                    </p>
                    <button
                      onClick={() => handleDeleteAnalysis(latest.id)}
                      disabled={!canAnalyze || deletingAnalysisId === latest.id}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50 shrink-0"
                    >
                      {deletingAnalysisId === latest.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                  <AnalysisResult analysis={latest} />
                </div>
              )}

              {olderHistory.length > 0 && (
                <details className="mt-5 border-t border-gray-100 pt-4">
                  <summary className="text-xs text-indigo-600 cursor-pointer hover:text-indigo-800 select-none">
                    Past analyses ({olderHistory.length})
                  </summary>
                  <div className="mt-3 space-y-5">
                    {olderHistory.map((a) => (
                      <div key={a.id} className="border-t border-gray-100 pt-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <p className="text-xs text-gray-400">
                            {fmtDateTime(a.createdAt)} · model {a.model}
                            {a.createdBy ? ` · by ${a.createdBy.fullName || a.createdBy.email}` : ''}
                          </p>
                          <button
                            onClick={() => handleDeleteAnalysis(a.id)}
                            disabled={!canAnalyze || deletingAnalysisId === a.id}
                            className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50 shrink-0"
                          >
                            {deletingAnalysisId === a.id ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                        <AnalysisResult analysis={a} />
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* Free-form AI chat */}
            <ChatPanel campaignId={campaign.id} canAnalyze={canAnalyze} />
          </>
        )}
      </div>
    </AppShell>
  );
}
