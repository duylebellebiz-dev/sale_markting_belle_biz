import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeKeyService } from './claude-key.service';
import { summarizeAudienceContext } from './ad-analyze.service';

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4000;

@Injectable()
export class AdBatchChatService {
  private readonly logger = new Logger(AdBatchChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claudeKeyService: ClaudeKeyService,
  ) {}

  async listMessages(batchAnalysisId: string, businessId: string, userId: string, isOwner: boolean) {
    const analysis = await this.assertAccess(batchAnalysisId, businessId, userId, isOwner);
    return this.prisma.adBatchChatMessage.findMany({
      where: { batchAnalysisId: analysis.id },
      orderBy: { createdAt: 'asc' },
      include: { createdBy: { select: { fullName: true, email: true } } },
    });
  }

  async clearHistory(batchAnalysisId: string, businessId: string, userId: string, isOwner: boolean): Promise<void> {
    const analysis = await this.assertAccess(batchAnalysisId, businessId, userId, isOwner);
    await this.prisma.adBatchChatMessage.deleteMany({ where: { batchAnalysisId: analysis.id } });
  }

  async sendMessage(batchAnalysisId: string, businessId: string, userId: string, isOwner: boolean, content: string) {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`);
    }

    const analysis = await this.assertAccess(batchAnalysisId, businessId, userId, isOwner);
    const apiKey = await this.claudeKeyService.getKey(businessId);

    const history = await this.prisma.adBatchChatMessage.findMany({
      where: { batchAnalysisId: analysis.id },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY_MESSAGES,
    });
    history.reverse();

    const userMessage = await this.prisma.adBatchChatMessage.create({
      data: {
        businessId,
        batchAnalysisId: analysis.id,
        role: 'user',
        content: trimmed,
        createdById: userId,
      },
      include: { createdBy: { select: { fullName: true, email: true } } },
    });

    const client = new Anthropic({ apiKey });
    let replyText: string;
    try {
      const message = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1200,
        system: this.buildSystemPrompt(analysis),
        messages: [
          ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user' as const, content: trimmed },
        ],
      });
      const textBlock = message.content.find((b) => b.type === 'text');
      replyText = textBlock && textBlock.type === 'text' ? textBlock.text : '(no response)';
    } catch (err) {
      this.logger.error(`Claude batch chat call failed for analysis ${batchAnalysisId}: ${err}`);
      throw new BadRequestException(
        `AI chat failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }

    const assistantMessage = await this.prisma.adBatchChatMessage.create({
      data: {
        businessId,
        batchAnalysisId: analysis.id,
        role: 'assistant',
        content: replyText,
      },
      include: { createdBy: { select: { fullName: true, email: true } } },
    });

    return { userMessage, assistantMessage };
  }

  private async assertAccess(batchAnalysisId: string, businessId: string, userId: string, isOwner: boolean) {
    const analysis = await this.prisma.adBatchAnalysis.findFirst({
      where: {
        id: batchAnalysisId,
        businessId,
        ...(isOwner ? {} : { createdById: userId }),
      },
    });
    if (!analysis) throw new NotFoundException('Batch analysis not found');

    const campaignIds = this.parseCampaignIds(analysis.campaignIds);
    const campaigns = await this.prisma.campaign.findMany({
      where: { id: { in: campaignIds }, businessId },
      include: {
        adAccount: { select: { provider: true, accountName: true } },
        metrics: { orderBy: { date: 'desc' }, take: 30 },
        keywords: { orderBy: { impressions: 'desc' }, take: 10 },
        searchTerms: { orderBy: { impressions: 'desc' }, take: 10 },
        targeting: true,
        demographics: { orderBy: { impressions: 'desc' }, take: 10 },
      },
    });

    if (campaigns.length !== campaignIds.length) {
      throw new NotFoundException('One or more campaigns in this analysis were not found');
    }

    return { ...analysis, campaigns };
  }

  private buildSystemPrompt(analysis: {
    contentReview: string;
    performanceAnalysis: string;
    audienceAnalysis: string;
    recommendations: Prisma.JsonValue;
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
    }>;
  }): string {
    const recommendationLines = Array.isArray(analysis.recommendations)
      ? analysis.recommendations.filter((item): item is string => typeof item === 'string')
      : [];

    const campaignBlocks = analysis.campaigns.map((campaign, index) => {
      const summary = this.summarizeMetrics(campaign.metrics);
      return [
        `Campaign ${index + 1}:`,
        `- Platform: ${campaign.adAccount.provider} (${campaign.adAccount.accountName || 'unnamed account'})`,
        `- Name: ${campaign.name}`,
        `- Objective: ${campaign.objective || 'unspecified'}`,
        `- Status: ${campaign.status || 'unspecified'}`,
        `- Headline: ${campaign.headline || '(none provided)'}`,
        `- Body/creative text: ${campaign.creativeText || '(none provided)'}`,
        `- Metrics: impressions ${summary.impressions}, clicks ${summary.clicks}, CTR ${summary.ctr}, spend $${summary.spend}, conversions ${summary.conversions}, avg ROAS ${summary.roas}`,
        `- Audience/keyword data: ${summarizeAudienceContext(campaign).replace(/\n/g, ' | ')}`,
      ].join('\n');
    });

    return [
      'You are a helpful, expert advertising/marketing assistant helping a small business interpret ONE saved cross-campaign analysis that compares multiple ads together.',
      '',
      'Rules:',
      '- ALWAYS reply in the same language the user just wrote in.',
      '- Ground your answer in the comparison findings and the campaign data below.',
      '- Be concrete and practical. If asked for next steps, write specific headlines, copy angles, targeting ideas, keyword ideas, or testing plans.',
      '- If the user asks which ad did better or worse, answer explicitly by campaign name when possible.',
      '- Keep answers concise unless the user asks for something longer.',
      '',
      'Saved comparison result:',
      `- Content review: ${analysis.contentReview || '(none)'}`,
      `- Performance analysis: ${analysis.performanceAnalysis || '(none)'}`,
      `- Audience analysis: ${analysis.audienceAnalysis || '(none)'}`,
      `- Recommendations: ${recommendationLines.length ? recommendationLines.join(' | ') : '(none)'}`,
      '',
      'Campaign context:',
      ...campaignBlocks,
    ].join('\n');
  }

  private parseCampaignIds(value: Prisma.JsonValue): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  }

  private summarizeMetrics(
    metrics: Array<{
      impressions: bigint;
      clicks: bigint;
      spend: Prisma.Decimal | null;
      conversions: number | null;
      roas: number | null;
    }>,
  ) {
    if (!metrics.length) {
      return { impressions: '0', clicks: '0', ctr: 'n/a', spend: '0.00', conversions: '0', roas: 'n/a' };
    }

    let impressions = 0n;
    let clicks = 0n;
    let spend = 0;
    let conversions = 0;
    let roasSum = 0;
    let roasCount = 0;

    for (const metric of metrics) {
      impressions += metric.impressions;
      clicks += metric.clicks;
      spend += metric.spend ? Number(metric.spend) : 0;
      conversions += metric.conversions ?? 0;
      if (metric.roas != null) {
        roasSum += metric.roas;
        roasCount += 1;
      }
    }

    return {
      impressions: impressions.toString(),
      clicks: clicks.toString(),
      ctr: impressions > 0n ? `${((Number(clicks) / Number(impressions)) * 100).toFixed(2)}%` : 'n/a',
      spend: spend.toFixed(2),
      conversions: conversions.toFixed(2),
      roas: roasCount > 0 ? `${(roasSum / roasCount).toFixed(2)}x` : 'n/a',
    };
  }
}
