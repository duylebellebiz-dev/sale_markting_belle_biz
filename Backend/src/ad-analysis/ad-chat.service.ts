/**
 * Free-form Q&A about one campaign — a staff member can ask anything in any
 * language ("what should this ad's copy say?", "phân tích chỗ ROAS thấp giúp
 * tôi", "¿qué título debería usar?") and get a reply grounded in this campaign's
 * own content + recent metrics. Kept as a running thread (history), separate
 * from the structured one-click AdAnalysis report.
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { ClaudeKeyService } from './claude-key.service';
import { AdOAuthService } from './ad-oauth.service';
import { summarizeAudienceContext } from './ad-analyze.service';

const CLAUDE_MODEL = 'claude-sonnet-4-6';
const MAX_HISTORY_MESSAGES = 20; // keep the prompt small — only the recent back-and-forth
const MAX_MESSAGE_LENGTH = 4000;

@Injectable()
export class AdChatService {
  private readonly logger = new Logger(AdChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claudeKeyService: ClaudeKeyService,
    private readonly oauthService: AdOAuthService,
  ) {}

  async listMessages(campaignId: string, businessId: string, userId: string, isOwner: boolean) {
    const campaign = await this.assertAccess(campaignId, businessId, userId, isOwner);
    return this.prisma.adChatMessage.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: 'asc' },
      include: { createdBy: { select: { fullName: true, email: true } } },
    });
  }

  /** Clears the whole chat thread for this campaign — irreversible. */
  async clearHistory(campaignId: string, businessId: string, userId: string, isOwner: boolean): Promise<void> {
    const campaign = await this.assertAccess(campaignId, businessId, userId, isOwner);
    await this.prisma.adChatMessage.deleteMany({ where: { campaignId: campaign.id } });
  }

  async sendMessage(campaignId: string, businessId: string, userId: string, isOwner: boolean, content: string) {
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`);
    }

    const campaign = await this.assertAccess(campaignId, businessId, userId, isOwner);
    const apiKey = await this.claudeKeyService.getKey(businessId);

    const history = await this.prisma.adChatMessage.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY_MESSAGES,
    });
    history.reverse();

    const userMessage = await this.prisma.adChatMessage.create({
      data: { businessId, campaignId: campaign.id, role: 'user', content: trimmed, createdById: userId },
    });

    const client = new Anthropic({ apiKey });
    let replyText: string;
    try {
      const message = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1200,
        system: this.buildSystemPrompt(campaign),
        messages: [
          ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user' as const, content: trimmed },
        ],
      });
      const textBlock = message.content.find((b) => b.type === 'text');
      replyText = textBlock && textBlock.type === 'text' ? textBlock.text : '(no response)';
    } catch (err) {
      this.logger.error(`Claude chat call failed for campaign ${campaignId}: ${err}`);
      throw new BadRequestException(
        `AI chat failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }

    const assistantMessage = await this.prisma.adChatMessage.create({
      data: { businessId, campaignId: campaign.id, role: 'assistant', content: replyText },
    });

    return { userMessage, assistantMessage };
  }

  // ── Access control ──────────────────────────────────────────────────────────

  private async assertAccess(campaignId: string, businessId: string, userId: string, isOwner: boolean) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, businessId },
      include: {
        adAccount: { select: { provider: true, accountName: true } },
        keywords: { orderBy: { impressions: 'desc' }, take: 25 },
        searchTerms: { orderBy: { impressions: 'desc' }, take: 25 },
        targeting: true,
        demographics: { orderBy: { impressions: 'desc' }, take: 20 },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const canAccess = await this.oauthService.canAccessAccount(campaign.adAccountId, businessId, userId, isOwner);
    if (!canAccess) throw new NotFoundException('Campaign not found');

    return campaign;
  }

  // ── Prompt building ──────────────────────────────────────────────────────────

  private buildSystemPrompt(campaign: {
    name: string;
    objective: string;
    status: string;
    headline: string;
    creativeText: string;
    startDate: Date | null;
    endDate: Date | null;
    adAccount: { provider: string; accountName: string };
    keywords: Array<{ text: string; matchType: string; impressions: bigint; clicks: bigint; spend: import('@prisma/client').Prisma.Decimal | null; ctr: number | null }>;
    searchTerms: Array<{ term: string; impressions: bigint; clicks: bigint; spend: import('@prisma/client').Prisma.Decimal | null }>;
    targeting: { ageRanges: unknown; genders: unknown; locations: unknown; interests: unknown; languages: unknown } | null;
    demographics: Array<{ ageRange: string; gender: string; region: string; impressions: bigint; clicks: bigint; spend: import('@prisma/client').Prisma.Decimal | null; conversions: number | null }>;
  }): string {
    return [
      'You are a helpful, expert advertising/marketing assistant helping a small business\'s sales or marketing staff with ONE specific ad campaign.',
      '',
      'Rules:',
      '- ALWAYS reply in the same language the user just wrote in (Vietnamese, English, or any other language) — match their language exactly, do not switch or mix languages.',
      '- Be concrete and practical: if asked for ad copy, write actual draft copy/headlines; if asked about keywords, suggest real keyword/negative-keyword ideas; if asked about audience/customer segments ("tệp khách hàng"), use the targeting + demographic data below to give specific guidance, not generic advice.',
      '- Keep answers reasonably concise unless the user asks for something long (e.g. multiple ad copy variants).',
      '- You may ask a short clarifying question if the request is ambiguous, but prefer to make a reasonable assumption and answer directly when possible.',
      '',
      'Campaign context (for grounding your answers):',
      `- Platform: ${campaign.adAccount.provider} (${campaign.adAccount.accountName || 'unnamed account'})`,
      `- Name: ${campaign.name}`,
      `- Objective: ${campaign.objective || 'unspecified'}`,
      `- Status: ${campaign.status || 'unspecified'}`,
      `- Current headline: ${campaign.headline || '(none provided)'}`,
      `- Current body/creative text: ${campaign.creativeText || '(none provided)'}`,
      `- Date range: ${campaign.startDate?.toISOString().slice(0, 10) ?? '?'} to ${campaign.endDate?.toISOString().slice(0, 10) ?? 'ongoing'}`,
      '',
      'Audience / keyword data:',
      summarizeAudienceContext(campaign),
    ].join('\n');
  }
}
