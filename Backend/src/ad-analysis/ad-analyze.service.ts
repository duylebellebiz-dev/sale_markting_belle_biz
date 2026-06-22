/**
 * Runs an AI analysis of one campaign's content + a compact metrics summary via the
 * Claude API, using the business's own stored (encrypted) API key. Never sends raw
 * per-day metric rows — only a small aggregated summary, to keep token usage low.
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeKeyService } from './claude-key.service';
import { AdOAuthService } from './ad-oauth.service';

const CLAUDE_MODEL = 'claude-opus-4-8';

interface AnalysisResult {
  contentReview: string;
  performanceAnalysis: string;
  audienceAnalysis: string;
  recommendations: string[];
}

@Injectable()
export class AdAnalyzeService {
  private readonly logger = new Logger(AdAnalyzeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claudeKeyService: ClaudeKeyService,
    private readonly oauthService: AdOAuthService,
  ) {}

  async analyze(campaignId: string, businessId: string, userId: string, isOwner: boolean) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, businessId },
      include: {
        adAccount: { select: { provider: true, accountName: true } },
        metrics: { orderBy: { date: 'asc' } },
        keywords: { orderBy: { impressions: 'desc' }, take: 25 },
        searchTerms: { orderBy: { impressions: 'desc' }, take: 25 },
        targeting: true,
        demographics: { orderBy: { impressions: 'desc' }, take: 20 },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const canAccess = await this.oauthService.canAccessAccount(campaign.adAccountId, businessId, userId, isOwner);
    if (!canAccess) throw new NotFoundException('Campaign not found');

    const apiKey = await this.claudeKeyService.getKey(businessId);
    const prompt = this.buildPrompt(campaign);

    const client = new Anthropic({ apiKey });
    let responseText: string;
    try {
      const message = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      });
      const textBlock = message.content.find((b) => b.type === 'text');
      responseText = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    } catch (err) {
      this.logger.error(`Claude API call failed for campaign ${campaignId}: ${err}`);
      throw new BadRequestException(
        `AI analysis failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }

    const parsed = this.parseResult(responseText);

    const analysis = await this.prisma.adAnalysis.create({
      data: {
        businessId,
        campaignId,
        createdById: userId,
        contentReview: parsed.contentReview,
        performanceAnalysis: parsed.performanceAnalysis,
        audienceAnalysis: parsed.audienceAnalysis,
        recommendations: parsed.recommendations as unknown as Prisma.InputJsonValue,
        model: CLAUDE_MODEL,
      },
    });

    return analysis;
  }

  async listAnalyses(campaignId: string, businessId: string, userId: string, isOwner: boolean) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, businessId },
      select: { id: true, adAccountId: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const canAccess = await this.oauthService.canAccessAccount(campaign.adAccountId, businessId, userId, isOwner);
    if (!canAccess) throw new NotFoundException('Campaign not found');

    return this.prisma.adAnalysis.findMany({
      where: { campaignId, businessId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { fullName: true, email: true } } },
    });
  }

  /** Deletes one past analysis report. Irreversible. */
  async deleteAnalysis(analysisId: string, campaignId: string, businessId: string, userId: string, isOwner: boolean): Promise<void> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, businessId },
      select: { id: true, adAccountId: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const canAccess = await this.oauthService.canAccessAccount(campaign.adAccountId, businessId, userId, isOwner);
    if (!canAccess) throw new NotFoundException('Campaign not found');

    const result = await this.prisma.adAnalysis.deleteMany({ where: { id: analysisId, campaignId, businessId } });
    if (result.count === 0) throw new NotFoundException('Analysis not found');
  }

  // ── Prompt building ──────────────────────────────────────────────────────────

  private buildPrompt(campaign: {
    name: string;
    objective: string;
    status: string;
    headline: string;
    creativeText: string;
    startDate: Date | null;
    endDate: Date | null;
    adAccount: { provider: string; accountName: string };
    metrics: Array<{
      date: Date;
      impressions: bigint;
      clicks: bigint;
      ctr: number | null;
      spend: Prisma.Decimal | null;
      conversions: number | null;
      cpc: Prisma.Decimal | null;
      cpa: Prisma.Decimal | null;
      reach: bigint | null;
      roas: number | null;
    }>;
    keywords: Array<{ text: string; matchType: string; impressions: bigint; clicks: bigint; spend: Prisma.Decimal | null; ctr: number | null }>;
    searchTerms: Array<{ term: string; impressions: bigint; clicks: bigint; spend: Prisma.Decimal | null }>;
    targeting: { ageRanges: unknown; genders: unknown; locations: unknown; interests: unknown; languages: unknown } | null;
    demographics: Array<{ ageRange: string; gender: string; region: string; impressions: bigint; clicks: bigint; spend: Prisma.Decimal | null; conversions: number | null }>;
  }): string {
    const summary = this.summarizeMetrics(campaign.metrics);
    const audienceContext = summarizeAudienceContext(campaign);

    const lines = [
      'You are analyzing one advertising campaign for a small business. Respond with ONLY a single JSON object — no markdown fences, no commentary before or after.',
      '',
      'JSON shape (exact keys):',
      '{"contentReview": string, "performanceAnalysis": string, "audienceAnalysis": string, "recommendations": string[]}',
      '',
      '— contentReview: feedback on the ad copy/creative (headline + body text). If no creative text is available, say so briefly.',
      '— performanceAnalysis: what the metrics say — CTR, CPC, CPA, ROAS, trend over the period, any wasted spend.',
      '— audienceAnalysis: deep read on the customer segment / targeting. For Google: which keywords and search terms are driving (or wasting) spend, and what new keywords/negative keywords to consider. For Facebook: which age/gender/location/interest segments perform best or worst, and how to refine targeting. If no keyword/targeting data is available, say so briefly.',
      '— recommendations: 3-6 concrete, specific next steps (budget, targeting, creative, keyword changes).',
      '',
      'Campaign:',
      `- Platform: ${campaign.adAccount.provider} (${campaign.adAccount.accountName || 'unnamed account'})`,
      `- Name: ${campaign.name}`,
      `- Objective: ${campaign.objective || 'unspecified'}`,
      `- Status: ${campaign.status || 'unspecified'}`,
      `- Headline: ${campaign.headline || '(none provided)'}`,
      `- Body / creative text: ${campaign.creativeText || '(none provided)'}`,
      `- Date range: ${campaign.startDate?.toISOString().slice(0, 10) ?? '?'} to ${campaign.endDate?.toISOString().slice(0, 10) ?? 'ongoing'}`,
      '',
      'Metrics summary (aggregated over the available period, not raw daily rows):',
      summary,
      '',
      'Audience / keyword context:',
      audienceContext,
    ];

    return lines.join('\n');
  }

  /** Aggregates daily metric rows into one compact summary block to keep token usage low. */
  private summarizeMetrics(
    metrics: Array<{
      date: Date;
      impressions: bigint;
      clicks: bigint;
      ctr: number | null;
      spend: Prisma.Decimal | null;
      conversions: number | null;
      cpc: Prisma.Decimal | null;
      cpa: Prisma.Decimal | null;
      reach: bigint | null;
      roas: number | null;
    }>,
  ): string {
    if (!metrics.length) return '(no metrics synced yet)';

    let impressions = 0n;
    let clicks = 0n;
    let spend = 0;
    let conversions = 0;
    let hasConversions = false;
    let reach = 0n;
    let hasReach = false;

    for (const m of metrics) {
      impressions += m.impressions;
      clicks += m.clicks;
      spend += m.spend ? Number(m.spend) : 0;
      if (m.conversions != null) {
        conversions += m.conversions;
        hasConversions = true;
      }
      if (m.reach != null) {
        reach += m.reach;
        hasReach = true;
      }
    }

    const ctr = impressions > 0n ? (Number(clicks) / Number(impressions)) * 100 : null;
    const cpc = Number(clicks) > 0 ? spend / Number(clicks) : null;
    const cpa = hasConversions && conversions > 0 ? spend / conversions : null;

    const first = metrics[0].date.toISOString().slice(0, 10);
    const last = metrics[metrics.length - 1].date.toISOString().slice(0, 10);

    const parts = [
      `- Period: ${first} to ${last} (${metrics.length} day${metrics.length === 1 ? '' : 's'} of data)`,
      `- Total impressions: ${impressions.toString()}`,
      `- Total clicks: ${clicks.toString()}`,
      `- Total spend: ${spend.toFixed(2)}`,
      `- Overall CTR: ${ctr !== null ? ctr.toFixed(2) + '%' : 'n/a'}`,
      `- Overall CPC: ${cpc !== null ? cpc.toFixed(2) : 'n/a'}`,
      `- Total conversions: ${hasConversions ? conversions.toFixed(2) : 'n/a'}`,
      `- Overall CPA: ${cpa !== null ? cpa.toFixed(2) : 'n/a'}`,
      `- Total reach: ${hasReach ? reach.toString() : 'n/a'}`,
    ];

    return parts.join('\n');
  }

  // ── Safe JSON parsing ────────────────────────────────────────────────────────

  /** Parses Claude's JSON reply defensively — strips markdown fences and falls back gracefully on malformed output. */
  private parseResult(text: string): AnalysisResult {
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    let raw: unknown;
    try {
      raw = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          raw = JSON.parse(match[0]);
        } catch {
          raw = null;
        }
      }
    }

    if (!raw || typeof raw !== 'object') {
      this.logger.warn(`Claude returned non-JSON analysis; storing raw text as contentReview.`);
      return {
        contentReview: cleaned || '(no response)',
        performanceAnalysis: '',
        audienceAnalysis: '',
        recommendations: [],
      };
    }

    const obj = raw as Record<string, unknown>;
    return {
      contentReview: typeof obj.contentReview === 'string' ? obj.contentReview : '',
      performanceAnalysis: typeof obj.performanceAnalysis === 'string' ? obj.performanceAnalysis : '',
      audienceAnalysis: typeof obj.audienceAnalysis === 'string' ? obj.audienceAnalysis : '',
      recommendations: Array.isArray(obj.recommendations)
        ? obj.recommendations.filter((r): r is string => typeof r === 'string')
        : [],
    };
  }
}

/**
 * Renders keyword (Google) / targeting + demographic (Facebook & Google) data into a
 * compact text block for AI prompts. Shared by single-campaign analysis, chat, and
 * cross-campaign batch analysis so all three give consistent audience commentary.
 */
export function summarizeAudienceContext(campaign: {
  keywords: Array<{ text: string; matchType: string; impressions: bigint; clicks: bigint; spend: Prisma.Decimal | null; ctr: number | null }>;
  searchTerms: Array<{ term: string; impressions: bigint; clicks: bigint; spend: Prisma.Decimal | null }>;
  targeting: { ageRanges: unknown; genders: unknown; locations: unknown; interests: unknown; languages: unknown } | null;
  demographics: Array<{ ageRange: string; gender: string; region: string; impressions: bigint; clicks: bigint; spend: Prisma.Decimal | null; conversions: number | null }>;
}): string {
  const parts: string[] = [];

  if (campaign.keywords.length) {
    parts.push('Top keywords (by impressions):');
    for (const k of campaign.keywords.slice(0, 15)) {
      const ctr = k.ctr != null ? `${(k.ctr * 100).toFixed(2)}% CTR` : 'n/a CTR';
      parts.push(`  - "${k.text}" (${k.matchType || 'match type n/a'}): ${k.impressions} impr, ${k.clicks} clicks, $${k.spend ?? 0} spend, ${ctr}`);
    }
  }

  if (campaign.searchTerms.length) {
    parts.push('Top search terms that triggered this ad:');
    for (const s of campaign.searchTerms.slice(0, 15)) {
      parts.push(`  - "${s.term}": ${s.impressions} impr, ${s.clicks} clicks, $${s.spend ?? 0} spend`);
    }
  }

  if (campaign.targeting) {
    const t = campaign.targeting;
    parts.push('Targeting / audience setup:');
    parts.push(`  - Age ranges: ${jsonList(t.ageRanges)}`);
    parts.push(`  - Genders: ${jsonList(t.genders)}`);
    parts.push(`  - Locations: ${jsonList(t.locations)}`);
    if (Array.isArray(t.interests) && t.interests.length) {
      parts.push(`  - Interests: ${(t.interests as Array<{ name?: string }>).map((i) => i.name).filter(Boolean).join(', ')}`);
    }
    parts.push(`  - Languages: ${jsonList(t.languages)}`);
  }

  if (campaign.demographics.length) {
    parts.push('Performance by audience segment (top by impressions):');
    for (const d of campaign.demographics.slice(0, 15)) {
      const seg = [d.ageRange, d.gender, d.region].filter(Boolean).join(' / ') || '(unspecified segment)';
      parts.push(`  - ${seg}: ${d.impressions} impr, ${d.clicks} clicks, $${d.spend ?? 0} spend${d.conversions != null ? `, ${d.conversions} conversions` : ''}`);
    }
  }

  return parts.length ? parts.join('\n') : '(no keyword/targeting/demographic data synced yet)';
}

function jsonList(v: unknown): string {
  if (Array.isArray(v) && v.length) return v.map(String).join(', ');
  return 'n/a';
}
