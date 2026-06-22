import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import {
  adsApi,
  type AdBatchAnalysis,
  type AdBatchChatMessage,
  type Campaign,
} from '../features/ads/adsApi';
import { usePermission } from '../features/staff/usePermission';

function extractMsg(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
}

function BatchChatPanel({
  analysis,
  canAnalyze,
  campaignNames,
}: {
  analysis: AdBatchAnalysis;
  canAnalyze: boolean;
  campaignNames: string[];
}) {
  const [messages, setMessages] = useState<AdBatchChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    adsApi.listBatchChatMessages(analysis.id)
      .then((msgs) => { if (!cancelled) setMessages(msgs); })
      .catch(() => { if (!cancelled) setError('Failed to load chat history.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [analysis.id]);

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
      const { userMessage, assistantMessage } = await adsApi.sendBatchChatMessage(analysis.id, text);
      setMessages((prev) => [...prev, userMessage, assistantMessage]);
    } catch (err) {
      setError(extractMsg(err, 'AI chat failed. Check that a Claude API key is configured in AI Settings.'));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  async function handleClear() {
    if (!canAnalyze || clearing || !messages.length) return;
    if (!window.confirm('Clear the entire chat history for this comparison? This cannot be undone.')) return;
    setClearing(true);
    setError(null);
    try {
      await adsApi.clearBatchChatHistory(analysis.id);
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
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Ask AI about this comparison</h2>
          <p className="text-xs text-gray-400 mt-1">
            Context: {campaignNames.join(', ') || `${analysis.campaignIds.length} selected campaigns`}
          </p>
        </div>
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
        Ask follow-up questions in Vietnamese, English, or any other language — for example:
        "ad nào đáng scale?", "nên viết mẫu content mới như thế nào?", or "which audience should I test next?"
      </p>

      {!canAnalyze && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
          You don&apos;t have the <strong>analyzeAds</strong> permission to use this chat.
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
                  m.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-200 text-gray-800'
                }`}
              >
                {m.content}
                {m.role === 'user' && m.createdBy && (
                  <p className="text-[10px] text-emerald-200 mt-1">{m.createdBy.fullName || m.createdBy.email}</p>
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
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={!canAnalyze || sending}
          placeholder="Ask anything about these campaigns…"
          rows={2}
          className="flex-1 resize-none rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!canAnalyze || sending || !input.trim()}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors self-end"
        >
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function BatchResultCard({
  analysis,
  campaignNames,
  canDelete,
  onDelete,
  isActive,
  onOpenChat,
}: {
  analysis: AdBatchAnalysis;
  campaignNames: string[];
  canDelete: boolean;
  onDelete?: (id: string) => void;
  isActive?: boolean;
  onOpenChat?: (analysisId: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!onDelete || deleting) return;
    if (!window.confirm('Delete this batch analysis? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await onDelete(analysis.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs text-gray-400">
            {fmtDateTime(analysis.createdAt)} · model {analysis.model}
            {analysis.createdBy ? ` · by ${analysis.createdBy.fullName || analysis.createdBy.email}` : ''}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Comparing {analysis.campaignIds.length} campaigns: {campaignNames.join(', ') || analysis.campaignIds.join(', ')}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {onOpenChat && (
            <button
              onClick={() => onOpenChat(analysis.id)}
              className={`text-xs hover:underline ${isActive ? 'text-emerald-700 font-semibold' : 'text-emerald-600 hover:text-emerald-800'}`}
            >
              {isActive ? 'Q&A open' : 'Ask follow-up'}
            </button>
          )}
          {canDelete && onDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-red-500 hover:text-red-700 hover:underline disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Content Comparison</h4>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{analysis.contentReview || '—'}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Performance Comparison</h4>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{analysis.performanceAnalysis || '—'}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Audience / Keyword Comparison</h4>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{analysis.audienceAnalysis || '—'}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Recommendations for next ad</h4>
          {analysis.recommendations.length ? (
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-800">
              {analysis.recommendations.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">—</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BatchAnalysisPage() {
  const canAnalyze = usePermission('analyzeAds');
  const [searchParams] = useSearchParams();
  const idsParam = searchParams.get('ids');
  const requestedIds = idsParam ? idsParam.split(',').filter(Boolean) : [];

  const [campaignNamesById, setCampaignNamesById] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<AdBatchAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AdBatchAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeChatAnalysisId, setActiveChatAnalysisId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [campaigns, batchHistory] = await Promise.all([
        adsApi.listCampaigns() as Promise<Campaign[]>,
        adsApi.listBatchAnalyses(),
      ]);
      const map: Record<string, string> = {};
      for (const c of campaigns) map[c.id] = c.name;
      setCampaignNamesById(map);
      setHistory(batchHistory);
      setActiveChatAnalysisId((prev) => prev ?? batchHistory[0]?.id ?? null);
    } catch {
      setError('Failed to load campaigns / history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRun() {
    if (requestedIds.length < 2 || !canAnalyze) return;
    setAnalyzing(true);
    setError(null);
    try {
      const analysis = await adsApi.analyzeBatch(requestedIds);
      setResult(analysis);
      setHistory((prev) => [analysis, ...prev.filter((item) => item.id !== analysis.id)]);
      setActiveChatAnalysisId(analysis.id);
    } catch (err) {
      setError(extractMsg(err, 'AI analysis failed. Check that a Claude API key is configured in AI Settings.'));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleDeleteHistory(id: string) {
    try {
      await adsApi.deleteBatchAnalysis(id);
      const nextHistory = history.filter((a) => a.id !== id);
      setHistory(nextHistory);
      const nextResult = result?.id === id ? null : result;
      setResult(nextResult);
      if (activeChatAnalysisId === id) {
        const fallback = nextResult ?? nextHistory[0] ?? null;
        setActiveChatAnalysisId(fallback?.id ?? null);
      }
    } catch {
      setError('Failed to delete this analysis.');
    }
  }

  function namesFor(ids: string[]) {
    return ids.map((id) => campaignNamesById[id]).filter(Boolean);
  }

  const displayedHistory = history.filter((item) => item.id !== result?.id);
  const activeAnalysis = (result && result.id === activeChatAnalysisId)
    ? result
    : history.find((item) => item.id === activeChatAnalysisId) ?? null;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto py-10 px-4">
        <Link to="/campaigns" className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline">
          ← Back to Campaigns
        </Link>

        <div className="mt-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Compare Multiple Campaigns</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            AI compares the selected campaigns together and suggests content for your next ad based on what worked.
          </p>
        </div>

        {!canAnalyze && (
          <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-700">
            You don&apos;t have the <strong>analyzeAds</strong> permission to run this analysis.
          </div>
        )}

        {requestedIds.length >= 2 && !result && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
            <p className="text-sm text-emerald-800 mb-2">
              Ready to compare {requestedIds.length} selected campaigns
              {namesFor(requestedIds).length ? `: ${namesFor(requestedIds).join(', ')}` : ''}.
            </p>
            <button
              onClick={handleRun}
              disabled={analyzing || !canAnalyze}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {analyzing ? 'Analyzing…' : 'Run Comparison'}
            </button>
          </div>
        )}

        {requestedIds.length > 0 && requestedIds.length < 2 && (
          <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
            Select at least 2 campaigns from the Campaigns page to compare.
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mb-8">
            <BatchResultCard
              analysis={result}
              campaignNames={namesFor(result.campaignIds)}
              canDelete={canAnalyze}
              onDelete={handleDeleteHistory}
              isActive={activeChatAnalysisId === result.id}
              onOpenChat={setActiveChatAnalysisId}
            />
          </div>
        )}

        {activeAnalysis && (
          <div className="mb-8">
            <BatchChatPanel
              analysis={activeAnalysis}
              canAnalyze={canAnalyze}
              campaignNames={namesFor(activeAnalysis.campaignIds)}
            />
          </div>
        )}

        <h2 className="text-sm font-semibold text-gray-700 mb-3">History</h2>
        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        )}
        {!loading && !displayedHistory.length && (
          <p className="text-sm text-gray-400 italic">No past comparisons yet.</p>
        )}
        <div className="space-y-4">
          {displayedHistory.map((h) => (
            <BatchResultCard
              key={h.id}
              analysis={h}
              campaignNames={namesFor(h.campaignIds)}
              canDelete={canAnalyze}
              onDelete={handleDeleteHistory}
              isActive={activeChatAnalysisId === h.id}
              onOpenChat={setActiveChatAnalysisId}
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
