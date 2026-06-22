/**
 * Cross-campaign AI analysis — compares several campaigns at once (e.g. every ad
 * from one fanpage this month) and gives ONE combined answer: which campaigns/
 * content performed best, patterns across them, and concrete content suggestions
 * for the next ad informed by what worked. Separate from the per-campaign
 * AdAnalysis report.
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeKeyService } from './claude-key.service';
import { AdOAuthService } from './ad-oauth.service';
import { summarizeAudienceContext } from './ad-analyze.service';

const CLAUDE_MODEL = 'claude-opus-4-8';
const MIN_CAMPAIGNS = 2;
const MAX_CAMPAIGNS = 20; // cap prompt size

interface BatchResult {
  contentReview: string;
  performanceAnalysis: string;
  audienceAnalysis: string;
  recommendations: string[];
}

@Injectable()
export class AdBatchAnalyzeService {
  private readonly logger = new Logger(AdBatchAnalyzeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claudeKeyService: ClaudeKeyService,
    private readonly oauthService: AdOAuthService,
  ) {}

  async analyze(campaignIds: string[], businessId: string, userId: string, isOwner: boolean) {
    const ids = Array.from(new Set(campaignIds));
    if (ids.length < MIN_CAMPAIGNS) {
      throw new BadRequestException(`Select at least ${MIN_CAMPAIGNS} campaigns to compare.`);
    }
    if (ids.length > MAX_CAMPAIGNS) {
      throw new BadRequestException(`Select at most ${MAX_CAMPAIGNS} campaigns at a time.`);
    }

    const campaigns = await this.prisma.campaign.findMany({
      where: { id: { in: ids }, businessId },
      include: {
        adAccount: { select: { provider: true, accountName: true } },
        metrics: { orderBy: { date: 'desc' }, take: 30 },
        keywords: { orderBy: { impressions: 'desc' }, take: 10 },
        searchTerms: { orderBy: { impressions: 'desc' }, take: 10 },
        targeting: true,
        demographics: { orderBy: { impressions: 'desc' }, take: 10 },
      },
    });
    if (campaigns.length !== ids.length) {
      throw new NotFoundException('One or more selected campaigns were not found.');
    }

    // Every campaign's ad account must be visible to this user.
    const uniqueAccountIds = Array.from(new Set(campaigns.map((c) => c.adAccountId)));
    for (const adAccountId of uniqueAccountIds) {
      const canAccess = await this.oauthService.canAccessAccount(adAccountId, businessId, userId, isOwner);
      if (!canAccess) throw new NotFoundException('One or more selected campaigns were not found.');
    }

    const apiKey = await this.claudeKeyService.getKey(businessId);
    const prompt = this.buildPrompt(campaigns);

    const client = new Anthropic({ apiKey });
    let responseText: string;
    try {
      const message = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });
      const textBlock = message.content.find((b) => b.type === 'text');
      responseText = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    } catch (err) {
      this.logger.error(`Claude batch analysis failed for campaigns [${ids.join(',')}]: ${err}`);
      throw new BadRequestException(
        `AI analysis failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }

    const parsed = this.parseResult(responseText);

    return this.prisma.adBatchAnalysis.create({
      data: {
        businessId,
        campaignIds: ids as unknown as Prisma.InputJsonValue,
        createdById: userId,
        contentReview: parsed.contentReview,
        performanceAnalysis: parsed.performanceAnalysis,
        audienceAnalysis: parsed.audienceAnalysis,
        recommendations: parsed.recommendations as unknown as Prisma.InputJsonValue,
        model: CLAUDE_MODEL,
      },
    });
  }

  /** Owners see every batch analysis in the business; staff see only their own runs. */
  async listAnalyses(businessId: string, userId: string, isOwner: boolean) {
    return this.prisma.adBatchAnalysis.findMany({
      where: { businessId, ...(isOwner ? {} : { createdById: userId }) },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { fullName: true, email: true } } },
    });
  }

  async deleteAnalysis(id: string, businessId: string, userId: string, isOwner: boolean): Promise<void> {
    const where = isOwner ? { id, businessId } : { id, businessId, createdById: userId };
    const result = await this.prisma.adBatchAnalysis.deleteMany({ where });
    if (result.count === 0) throw new NotFoundException('Analysis not found');
  }

  // ── Prompt building ──────────────────────────────────────────────────────────

  private buildPrompt(
    campaigns: Array<{
      name: string;
      objective: string;
      status: string;
      headline: string;
      creativeText: string;
      adAccount: { provider: string; accountName: string };
      metrics: Array<{
        impressions: bigint;
        clicks: bigint;
        spend: Prisma.Decimal | null;
        conversions: number | null;
        roas: number | null;
      }>;
      keywords: Array<{ text: string; matchType: string; impressions: bigint; clicks: bigint; spend: Prisma.Decimal | null; ctr: number | null }>;
      searchTerms: Array<{ term: string; impressions: bigint; clicks: bigint; spend: Prisma.Decimal | null }>;
      targeting: { ageRanges: unknown; genders: unknown; locations: unknown; interests: unknown; languages: unknown } | null;
      demographics: Array<{ ageRange: string; gender: string; region: string; impressions: bigint; clicks: bigint; spend: Prisma.Decimal | null; conversions: number | null }>;
    }>,
  ): string {
    const blocks = campaigns.map((c, i) => {
      const s = this.summarize(c.metrics);
      return [
        `Campaign ${i + 1}:`,
        `- Platform: ${c.adAccount.provider} (${c.adAccount.accountName || 'unnamed account'})`,
        `- Name: ${c.name}`,
        `- Objective: ${c.objective || 'unspecified'}`,
        `- Status: ${c.status || 'unspecified'}`,
        `- Headline: ${c.headline || '(none provided)'}`,
        `- Body/creative text: ${c.creativeText || '(none provided)'}`,
        `- Metrics: impressions ${s.impressions}, clicks ${s.clicks}, CTR ${s.ctr}, spend $${s.spend}, conversions ${s.conversions}, avg ROAS ${s.roas}`,
        `- Audience/keyword data: ${summarizeAudienceContext(c).replace(/\n/g, ' | ')}`,
      ].join('\n');
    });

    return [
      `You are comparing ${campaigns.length} advertising campaigns for a small business, to find patterns and inform future ad content and targeting. Respond with ONLY a single JSON object — no markdown fences, no commentary before or after.`,
      '',
      'JSON shape (exact keys):',
      '{"contentReview": string, "performanceAnalysis": string, "audienceAnalysis": string, "recommendations": string[]}',
      '',
      '— contentReview: compare the ad copy/creative across these campaigns — which headlines/body styles correlate with the best results, and why (tone, length, offer, CTA, etc.).',
      '— performanceAnalysis: cross-campaign performance comparison — rank or group by what is working vs not (CTR, CPC, ROAS, spend efficiency), call out standouts and underperformers by name.',
      '— audienceAnalysis: compare keyword/search-term patterns (Google) and targeting/demographic segments (Facebook) across these campaigns — which keywords or audience segments consistently perform best/worst, and what customer segment ("tệp khách hàng") the next ad should target.',
      '— recommendations: 4-8 concrete, specific content/strategy/targeting suggestions for the NEXT ad, directly informed by what worked across these campaigns (e.g. draft a headline/body suggestion grounded in the winning pattern, or a keyword/audience refinement).',
      '',
      blocks.join('\n\n'),
    ].join('\n');
  }

  private summarize(metrics: Array<{ impressions: bigint; clicks: bigint; spend: Prisma.Decimal | null; conversions: number | null; roas: number | null }>) {
    if (!metrics.length) return { impressions: '0', clicks: '0', ctr: 'n/a', spend: '0.00', conversions: '0', roas: 'n/a' };
    let impressions = 0n, clicks = 0n, spend = 0, conversions = 0;
    let roasSum = 0, roasCount = 0;
    for (const m of metrics) {
      impressions += m.impressions;
      clicks += m.clicks;
      spend += m.spend ? Number(m.spend) : 0;
      conversions += m.conversions ?? 0;
      if (m.roas != null) { roasSum += m.roas; roasCount++; }
    }
    const ctr = impressions > 0n ? ((Number(clicks) / Number(impressions)) * 100).toFixed(2) + '%' : 'n/a';
    const roas = roasCount > 0 ? (roasSum / roasCount).toFixed(2) + '×' : 'n/a';
    return { impressions: impressions.toString(), clicks: clicks.toString(), ctr, spend: spend.toFixed(2), conversions: conversions.toFixed(2), roas };
  }

  // ── Safe JSON parsing (same defensive approach as AdAnalyzeService) ──────────

  private parseResult(text: string): BatchResult {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    let raw: unknown;
    try {
      raw = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { raw = JSON.parse(match[0]); } catch { raw = null; }
      }
    }

    if (!raw || typeof raw !== 'object') {
      this.logger.warn('Claude returned non-JSON batch analysis; storing raw text as contentReview.');
      return { contentReview: cleaned || '(no response)', performanceAnalysis: '', audienceAnalysis: '', recommendations: [] };
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
