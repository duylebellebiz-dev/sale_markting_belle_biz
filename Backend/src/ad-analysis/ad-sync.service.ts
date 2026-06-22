/**
 * Pulls campaigns + daily metrics from the Facebook Marketing API and Google Ads API.
 *
 * Design decisions:
 *  - Incremental: finds the latest metric date already stored for this ad account,
 *    then fetches from that date (or last 30 days if none).
 *  - Upsert: campaigns and metrics are upserted so re-running sync is idempotent.
 *  - Pagination: follows cursor/page tokens until exhausted.
 *  - Rate limits: 100 ms delay between pages; retries once after 60 s on HTTP 429.
 *  - Never throws on a single-campaign failure — logs the error and continues.
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdOAuthService } from './ad-oauth.service';
import { decrypt } from '../common/crypto';

const FB_API = 'https://graph.facebook.com/v21.0';
const GOOGLE_API = 'https://googleads.googleapis.com/v18';

const INCREMENTAL_DEFAULT_DAYS = 30;
const PAGE_DELAY_MS = 120; // gentle pause between paginated requests
const RETRY_AFTER_MS = 62_000; // wait > 60 s on 429, then retry once

// ── Types for internal use ──────────────────────────────────────────────────

interface NormalizedCampaign {
  externalCampaignId: string;
  name: string;
  objective: string;
  status: string;
  headline: string;       // ad creative headline, when the platform exposes one
  creativeText: string;   // primary text / body copy
  startDate: Date | null;
  endDate: Date | null;
  raw: object;
}

interface NormalizedMetric {
  date: Date;        // UTC midnight
  impressions: bigint;
  clicks: bigint;
  ctr: number | null;
  spend: string | null;          // Decimal-safe string
  conversions: number | null;
  cpc: string | null;
  cpa: string | null;
  reach: bigint | null;
  roas: number | null;
}

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class AdSyncService {
  private readonly logger = new Logger(AdSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauthService: AdOAuthService,
  ) {}

  /**
   * Syncs campaigns + metrics for a given AdAccount.
   * Returns a summary: { campaignsUpserted, metricsUpserted, dateFrom, dateTo }.
   */
  async sync(adAccountId: string, businessId: string, userId: string, isOwner: boolean) {
    const canAccess = await this.oauthService.canAccessAccount(adAccountId, businessId, userId, isOwner);
    if (!canAccess) throw new NotFoundException('Ad account not found');

    const adAccount = await this.prisma.adAccount.findFirst({ where: { id: adAccountId, businessId } });
    if (!adAccount) throw new NotFoundException('Ad account not found');
    if (adAccount.status === 'disconnected') {
      throw new BadRequestException(
        'This ad account is disconnected. Please reconnect it first.',
      );
    }

    const accessToken = await this.oauthService.getValidAccessToken(adAccount.connectionId);

    // Determine incremental date window
    const { dateFrom, dateTo } = await this.getDateWindow(adAccountId);

    this.logger.log(
      `Syncing ${adAccount.provider} adAccount ${adAccountId} from ${dateFrom.toISOString().slice(0, 10)} to ${dateTo.toISOString().slice(0, 10)}`,
    );

    let campaignsUpserted = 0;
    let metricsUpserted = 0;

    if (adAccount.provider === 'facebook') {
      const result = await this.syncFacebook(adAccount, accessToken, dateFrom, dateTo);
      campaignsUpserted = result.campaignsUpserted;
      metricsUpserted = result.metricsUpserted;
    } else {
      const result = await this.syncGoogle(adAccount, accessToken, dateFrom, dateTo);
      campaignsUpserted = result.campaignsUpserted;
      metricsUpserted = result.metricsUpserted;
    }

    return {
      campaignsUpserted,
      metricsUpserted,
      dateFrom: dateFrom.toISOString().slice(0, 10),
      dateTo: dateTo.toISOString().slice(0, 10),
    };
  }

  // ── List campaigns with latest metrics ──────────────────────────────────────

  /**
   * dateFrom/dateTo (both given together) select an explicit reporting period — every
   * metric row in range is returned, no cap. Without them, defaults to the last 30
   * synced days (the old behaviour) so the page stays light by default.
   */
  async listCampaigns(
    businessId: string,
    userId: string,
    isOwner: boolean,
    adAccountId?: string,
    dateFrom?: Date,
    dateTo?: Date,
  ) {
    const visibleIds = await this.oauthService.visibleAdAccountIds(businessId, userId, isOwner);
    if (visibleIds && adAccountId && !visibleIds.includes(adAccountId)) {
      return []; // requested account isn't visible to this user
    }

    const hasRange = !!dateFrom && !!dateTo;

    const campaigns = await this.prisma.campaign.findMany({
      where: {
        businessId,
        ...(adAccountId ? { adAccountId } : visibleIds ? { adAccountId: { in: visibleIds } } : {}),
      },
      include: {
        adAccount: { select: { provider: true, accountName: true, status: true } },
        metrics: {
          where: hasRange ? { date: { gte: dateFrom, lte: dateTo } } : undefined,
          orderBy: { date: 'desc' },
          ...(hasRange ? {} : { take: 30 }), // last 30 synced days when no explicit period
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return campaigns;
  }

  /** Keyword / targeting / demographic data for one campaign's detail view. */
  async getAudienceData(campaignId: string, businessId: string, userId: string, isOwner: boolean) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, businessId },
      select: { id: true, adAccountId: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const canAccess = await this.oauthService.canAccessAccount(campaign.adAccountId, businessId, userId, isOwner);
    if (!canAccess) throw new NotFoundException('Campaign not found');

    const [keywords, searchTerms, targeting, demographics] = await Promise.all([
      this.prisma.campaignKeyword.findMany({ where: { campaignId }, orderBy: { impressions: 'desc' } }),
      this.prisma.campaignSearchTerm.findMany({ where: { campaignId }, orderBy: { impressions: 'desc' } }),
      this.prisma.campaignTargeting.findUnique({ where: { campaignId } }),
      this.prisma.campaignDemographic.findMany({ where: { campaignId }, orderBy: { impressions: 'desc' } }),
    ]);

    return { keywords, searchTerms, targeting, demographics };
  }

  // ── Incremental date window ─────────────────────────────────────────────────

  private async getDateWindow(adAccountId: string): Promise<{ dateFrom: Date; dateTo: Date }> {
    const latest = await this.prisma.campaignMetric.findFirst({
      where: { campaign: { adAccountId } },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    const dateTo = utcMidnight(new Date());
    // If we have metrics, start from the day after the last synced date so we
    // refresh the most recent day (partial data on sync day).
    const dateFrom = latest
      ? utcMidnight(addDays(latest.date, -1)) // re-fetch yesterday to catch late updates
      : utcMidnight(addDays(new Date(), -INCREMENTAL_DEFAULT_DAYS));

    return { dateFrom, dateTo };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Facebook Marketing API
  // ══════════════════════════════════════════════════════════════════════════

  private async syncFacebook(
    adAccount: { id: string; businessId: string; externalAccountId: string; accountName: string },
    accessToken: string,
    dateFrom: Date,
    dateTo: Date,
  ) {
    let campaignsUpserted = 0;
    let metricsUpserted = 0;

    // Resolve the ad account ID (act_XXXXXXXXX)
    const fbAdAccountId = await this.resolveFbAdAccountId(adAccount, accessToken);

    // Fetch all campaigns under this ad account (paginated)
    const campaigns = await this.fbFetchAllPages<FbCampaign>(
      `${FB_API}/${fbAdAccountId}/campaigns`,
      {
        fields: 'id,name,objective,status,start_time,stop_time',
        access_token: accessToken,
        limit: '100',
      },
    );

    for (const fbCamp of campaigns) {
      const { headline, creativeText } = await this.fetchFbCampaignCreative(fbCamp.id, accessToken);

      const norm: NormalizedCampaign = {
        externalCampaignId: fbCamp.id,
        name: fbCamp.name,
        objective: fbCamp.objective ?? '',
        status: fbCamp.status ?? '',
        headline,
        creativeText,
        startDate: fbCamp.start_time ? new Date(fbCamp.start_time) : null,
        endDate: fbCamp.stop_time ? new Date(fbCamp.stop_time) : null,
        raw: fbCamp as object,
      };

      const campaign = await this.upsertCampaign(adAccount, norm);
      campaignsUpserted++;

      // Fetch daily insights for this campaign in the date window
      const since = dateFrom.toISOString().slice(0, 10);
      const until = dateTo.toISOString().slice(0, 10);

      let insights: FbInsightRow[] = [];
      try {
        insights = await this.fbFetchAllPages<FbInsightRow>(
          `${FB_API}/${fbCamp.id}/insights`,
          {
            fields: 'impressions,reach,clicks,ctr,spend,actions,action_values,cost_per_action_type,cpc,date_start,date_stop',
            time_increment: '1',
            time_range: JSON.stringify({ since, until }),
            access_token: accessToken,
            limit: '100',
          },
        );
      } catch (err) {
        this.logger.warn(`Failed to fetch insights for FB campaign ${fbCamp.id}: ${err}`);
        continue;
      }

      for (const row of insights) {
        const m = this.normalizeFbInsight(row);
        await this.upsertMetric(campaign.id, m);
        metricsUpserted++;
      }

      await this.syncFbTargetingAndDemographics(campaign.id, adAccount.businessId, fbCamp.id, accessToken, since, until);

      await delay(PAGE_DELAY_MS);
    }

    return { campaignsUpserted, metricsUpserted };
  }

  /** Audience targeting (from the campaign's adsets) + age/gender/country performance breakdown. */
  private async syncFbTargetingAndDemographics(
    campaignId: string,
    businessId: string,
    fbCampaignId: string,
    accessToken: string,
    since: string,
    until: string,
  ) {
    try {
      const adsets = await this.fbGet<{ data: FbAdset[] }>(
        `${FB_API}/${fbCampaignId}/adsets`,
        { fields: 'targeting', limit: '1', access_token: accessToken },
      );
      const targeting = adsets.data[0]?.targeting;
      if (targeting) {
        const ageRanges = targeting.age_min || targeting.age_max
          ? [`${targeting.age_min ?? 13}-${targeting.age_max ?? 65}`]
          : [];
        const genders = (targeting.genders ?? []).map((g) => (g === 1 ? 'male' : g === 2 ? 'female' : 'all'));
        const locations = (targeting.geo_locations?.countries ?? [])
          .concat((targeting.geo_locations?.cities ?? []).map((c) => c.name).filter(Boolean) as string[])
          .concat((targeting.geo_locations?.regions ?? []).map((r) => r.name).filter(Boolean) as string[]);
        const interests = (targeting.flexible_spec ?? [])
          .flatMap((spec) => spec.interests ?? [])
          .map((i) => ({ id: i.id, name: i.name }));

        await this.prisma.campaignTargeting.upsert({
          where: { campaignId },
          create: {
            businessId,
            campaignId,
            provider: 'facebook',
            ageRanges: ageRanges as Prisma.InputJsonValue,
            genders: genders as Prisma.InputJsonValue,
            locations: locations as Prisma.InputJsonValue,
            interests: interests as Prisma.InputJsonValue,
            languages: [] as Prisma.InputJsonValue,
            raw: targeting as Prisma.InputJsonValue,
          },
          update: {
            ageRanges: ageRanges as Prisma.InputJsonValue,
            genders: genders as Prisma.InputJsonValue,
            locations: locations as Prisma.InputJsonValue,
            interests: interests as Prisma.InputJsonValue,
            raw: targeting as Prisma.InputJsonValue,
          },
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch FB targeting for campaign ${fbCampaignId}: ${err}`);
    }

    try {
      const rows = await this.fbFetchAllPages<FbDemographicRow>(
        `${FB_API}/${fbCampaignId}/insights`,
        {
          fields: 'impressions,clicks,spend,actions',
          breakdowns: 'age,gender,country',
          time_range: JSON.stringify({ since, until }),
          access_token: accessToken,
          limit: '200',
        },
      );
      for (const row of rows) {
        const impressions = BigInt(parseInt(row.impressions ?? '0', 10) || 0);
        const clicks = BigInt(parseInt(row.clicks ?? '0', 10) || 0);
        const spend = parseFloat(row.spend ?? '0') || 0;
        let conversions: number | null = null;
        if (row.actions) {
          for (const a of row.actions) {
            if (a.action_type === 'purchase' || a.action_type === 'lead') {
              conversions = (conversions ?? 0) + (parseFloat(a.value ?? '0') || 0);
            }
          }
        }
        await this.prisma.campaignDemographic.upsert({
          where: {
            campaignId_ageRange_gender_region: {
              campaignId,
              ageRange: row.age ?? '',
              gender: row.gender ?? '',
              region: row.country ?? '',
            },
          },
          create: {
            businessId,
            campaignId,
            ageRange: row.age ?? '',
            gender: row.gender ?? '',
            region: row.country ?? '',
            impressions,
            clicks,
            spend: spend.toFixed(4),
            conversions,
          },
          update: { impressions, clicks, spend: spend.toFixed(4), conversions },
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch FB demographic breakdown for campaign ${fbCampaignId}: ${err}`);
    }
  }

  private async resolveFbAdAccountId(
    adAccount: { id: string; externalAccountId: string; accountName: string },
    accessToken: string,
  ): Promise<string> {
    if (adAccount.externalAccountId) return adAccount.externalAccountId;

    // Fetch user's ad accounts and pick the first one
    const result = await this.fbGet<{ data: Array<{ id: string; name: string }> }>(
      `${FB_API}/me/adaccounts`,
      { fields: 'id,name', access_token: accessToken, limit: '10' },
    );
    const first = result.data[0];
    if (!first) throw new BadRequestException('No Facebook ad accounts found under this user token.');

    // Store the resolved ID and name
    await this.prisma.adAccount.update({
      where: { id: adAccount.id },
      data: { externalAccountId: first.id, accountName: first.name },
    });

    return first.id;
  }

  /**
   * Pulls the headline + primary text from one representative ad under this campaign.
   * A campaign can hold multiple ads with different creatives — we take the first
   * active one as a stand-in for "what this campaign's ad says" (good enough for the
   * AI content review; users can paste alternate ad copy into the chat if needed).
   */
  private async fetchFbCampaignCreative(campaignId: string, accessToken: string): Promise<{ headline: string; creativeText: string }> {
    try {
      const result = await this.fbGet<{ data: FbAd[] }>(
        `${FB_API}/${campaignId}/ads`,
        {
          fields: 'creative{title,body,object_story_spec}',
          limit: '1',
          access_token: accessToken,
        },
      );
      const creative = result.data[0]?.creative;
      if (!creative) return { headline: '', creativeText: '' };

      const linkData = creative.object_story_spec?.link_data;
      const videoData = creative.object_story_spec?.video_data;

      const headline = creative.title || linkData?.name || videoData?.title || '';
      const creativeText = creative.body || linkData?.message || linkData?.description || videoData?.message || '';

      return { headline, creativeText };
    } catch (err) {
      this.logger.warn(`Failed to fetch ad creative for FB campaign ${campaignId}: ${err}`);
      return { headline: '', creativeText: '' };
    }
  }

  private normalizeFbInsight(row: FbInsightRow): NormalizedMetric {
    const spend = parseFloat(row.spend ?? '0') || 0;
    const clicks = BigInt(parseInt(row.clicks ?? '0', 10) || 0);
    const impressions = BigInt(parseInt(row.impressions ?? '0', 10) || 0);
    const reach = row.reach ? BigInt(parseInt(row.reach, 10) || 0) : null;

    // CTR from Facebook is already a percentage string — convert to fraction
    const ctrPct = parseFloat(row.ctr ?? '0') || 0;
    const ctr = ctrPct / 100;

    const cpc = row.cpc ? parseFloat(row.cpc) || null : null;

    // Conversions: sum action values for purchase/lead/complete_registration
    const CONV_TYPES = new Set([
      'offsite_conversion.fb_pixel_purchase',
      'offsite_conversion.fb_pixel_lead',
      'offsite_conversion.fb_pixel_complete_registration',
      'lead',
      'purchase',
    ]);
    let conversions: number | null = null;
    let revenue = 0;
    if (row.actions) {
      for (const a of row.actions) {
        if (CONV_TYPES.has(a.action_type)) {
          conversions = (conversions ?? 0) + parseFloat(a.value ?? '0');
        }
      }
    }
    if (row.action_values) {
      for (const av of row.action_values) {
        if (CONV_TYPES.has(av.action_type)) {
          revenue += parseFloat(av.value ?? '0');
        }
      }
    }

    const cpa = conversions && conversions > 0 && spend > 0
      ? (spend / conversions).toFixed(4)
      : null;
    const roas = revenue > 0 && spend > 0 ? revenue / spend : null;

    return {
      date: utcMidnight(new Date(row.date_start)),
      impressions,
      clicks,
      ctr,
      spend: spend.toFixed(4),
      conversions,
      cpc: cpc !== null ? cpc.toFixed(4) : null,
      cpa,
      reach,
      roas,
    };
  }

  // ── Facebook paginated fetch ────────────────────────────────────────────────

  private async fbFetchAllPages<T>(url: string, params: Record<string, string>): Promise<T[]> {
    const results: T[] = [];
    let nextUrl: string | null = `${url}?${new URLSearchParams(params)}`;

    while (nextUrl) {
      const data = await this.fbGet<{ data: T[]; paging?: { next?: string } }>(nextUrl, {});
      results.push(...data.data);
      nextUrl = data.paging?.next ?? null;
      if (nextUrl) await delay(PAGE_DELAY_MS);
    }

    return results;
  }

  private async fbGet<T>(url: string, params: Record<string, string>): Promise<T> {
    const fullUrl = Object.keys(params).length
      ? `${url}?${new URLSearchParams(params)}`
      : url;
    return this.jsonFetch<T>(fullUrl, {});
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Google Ads API
  // ══════════════════════════════════════════════════════════════════════════

  private async syncGoogle(
    adAccount: { id: string; businessId: string; externalAccountId: string; accountName: string },
    accessToken: string,
    dateFrom: Date,
    dateTo: Date,
  ) {
    let campaignsUpserted = 0;
    let metricsUpserted = 0;

    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!devToken) {
      throw new BadRequestException(
        'GOOGLE_ADS_DEVELOPER_TOKEN is not set. See .env.example for setup instructions.',
      );
    }

    const customerId = await this.resolveGoogleCustomerId(adAccount, accessToken, devToken);
    const headers = this.googleHeaders(accessToken, devToken);

    // 1. Fetch all non-removed campaigns
    const campaigns = await this.googleQueryAll<GoogleCampaignRow>(
      customerId,
      `SELECT campaign.id, campaign.name, campaign.status,
              campaign.advertising_channel_type, campaign.start_date, campaign.end_date
       FROM campaign
       WHERE campaign.status != 'REMOVED'`,
      headers,
    );

    // 2. For each campaign, fetch daily metrics in the date window
    const since = dateFrom.toISOString().slice(0, 10);
    const until = dateTo.toISOString().slice(0, 10);

    for (const row of campaigns) {
      const c = row.campaign;
      const { headline, creativeText } = await this.fetchGoogleCampaignCreative(customerId, String(c.id), headers);

      const norm: NormalizedCampaign = {
        externalCampaignId: String(c.id),
        name: c.name,
        objective: c.advertisingChannelType ?? '',
        status: c.status ?? '',
        headline,
        creativeText,
        startDate: c.startDate ? parseGoogleDate(c.startDate) : null,
        endDate: c.endDate ? parseGoogleDate(c.endDate) : null,
        raw: row as object,
      };

      const campaign = await this.upsertCampaign(adAccount, norm);
      campaignsUpserted++;

      // Fetch metrics for this campaign
      let metricRows: GoogleMetricRow[] = [];
      try {
        metricRows = await this.googleQueryAll<GoogleMetricRow>(
          customerId,
          `SELECT campaign.id, segments.date,
                  metrics.impressions, metrics.clicks, metrics.ctr,
                  metrics.cost_micros, metrics.average_cpc, metrics.conversions,
                  metrics.cost_per_conversion, metrics.conversions_value, metrics.reach_metrics
           FROM campaign
           WHERE campaign.id = ${c.id}
             AND segments.date BETWEEN '${since}' AND '${until}'`,
          headers,
        );
      } catch (err) {
        this.logger.warn(`Failed to fetch metrics for Google campaign ${c.id}: ${err}`);
        continue;
      }

      for (const mRow of metricRows) {
        const m = this.normalizeGoogleMetric(mRow);
        if (m) {
          await this.upsertMetric(campaign.id, m);
          metricsUpserted++;
        }
      }

      await this.syncGoogleKeywordsAndAudience(campaign.id, adAccount.businessId, customerId, String(c.id), headers, since, until);

      await delay(PAGE_DELAY_MS);
    }

    return { campaignsUpserted, metricsUpserted };
  }

  /** Keywords, search terms, targeting criteria, and age/gender demographics for one campaign. */
  private async syncGoogleKeywordsAndAudience(
    campaignId: string,
    businessId: string,
    customerId: string,
    googleCampaignId: string,
    headers: Record<string, string>,
    since: string,
    until: string,
  ) {
    // Keywords
    try {
      const rows = await this.googleQueryAll<GoogleKeywordRow>(
        customerId,
        `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
                ad_group_criterion.status, metrics.impressions, metrics.clicks,
                metrics.cost_micros, metrics.ctr
         FROM keyword_view
         WHERE campaign.id = ${googleCampaignId}
           AND segments.date BETWEEN '${since}' AND '${until}'`,
        headers,
      );
      const byKey = new Map<string, { text: string; matchType: string; status: string; impressions: bigint; clicks: bigint; spend: number; ctrSum: number; ctrCount: number }>();
      for (const row of rows) {
        const text = row.adGroupCriterion?.keyword?.text ?? '';
        const matchType = row.adGroupCriterion?.keyword?.matchType ?? '';
        if (!text) continue;
        const key = `${text}::${matchType}`;
        const existing = byKey.get(key) ?? {
          text, matchType, status: row.adGroupCriterion?.status ?? '',
          impressions: 0n, clicks: 0n, spend: 0, ctrSum: 0, ctrCount: 0,
        };
        existing.impressions += BigInt(Math.round(Number(row.metrics?.impressions ?? 0)));
        existing.clicks += BigInt(Math.round(Number(row.metrics?.clicks ?? 0)));
        existing.spend += Number(row.metrics?.costMicros ?? 0) / 1_000_000;
        if (row.metrics?.ctr != null) { existing.ctrSum += Number(row.metrics.ctr); existing.ctrCount++; }
        byKey.set(key, existing);
      }
      for (const k of byKey.values()) {
        await this.prisma.campaignKeyword.upsert({
          where: { campaignId_text_matchType: { campaignId, text: k.text, matchType: k.matchType } },
          create: {
            businessId, campaignId, text: k.text, matchType: k.matchType, status: k.status,
            impressions: k.impressions, clicks: k.clicks,
            spend: k.spend.toFixed(4), ctr: k.ctrCount ? k.ctrSum / k.ctrCount : null,
          },
          update: {
            status: k.status, impressions: k.impressions, clicks: k.clicks,
            spend: k.spend.toFixed(4), ctr: k.ctrCount ? k.ctrSum / k.ctrCount : null,
          },
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch Google keywords for campaign ${googleCampaignId}: ${err}`);
    }

    // Search terms (top 50 by impressions)
    try {
      const rows = await this.googleQueryAll<GoogleSearchTermRow>(
        customerId,
        `SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros
         FROM search_term_view
         WHERE campaign.id = ${googleCampaignId}
           AND segments.date BETWEEN '${since}' AND '${until}'
         ORDER BY metrics.impressions DESC
         LIMIT 50`,
        headers,
      );
      for (const row of rows) {
        const term = row.searchTermView?.searchTerm ?? '';
        if (!term) continue;
        const impressions = BigInt(Math.round(Number(row.metrics?.impressions ?? 0)));
        const clicks = BigInt(Math.round(Number(row.metrics?.clicks ?? 0)));
        const spend = Number(row.metrics?.costMicros ?? 0) / 1_000_000;
        await this.prisma.campaignSearchTerm.upsert({
          where: { campaignId_term: { campaignId, term } },
          create: { businessId, campaignId, term, impressions, clicks, spend: spend.toFixed(4) },
          update: { impressions, clicks, spend: spend.toFixed(4) },
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch Google search terms for campaign ${googleCampaignId}: ${err}`);
    }

    // Targeting criteria (age/gender/location/language)
    try {
      const rows = await this.googleQueryAll<GoogleCriterionRow>(
        customerId,
        `SELECT campaign_criterion.type, campaign_criterion.age_range.type,
                campaign_criterion.gender.type, campaign_criterion.location.geo_target_constant,
                campaign_criterion.language.language_constant, campaign_criterion.negative
         FROM campaign_criterion
         WHERE campaign.id = ${googleCampaignId} AND campaign_criterion.negative = false`,
        headers,
      );
      const ageRanges = new Set<string>();
      const genders = new Set<string>();
      const locations = new Set<string>();
      const languages = new Set<string>();
      for (const row of rows) {
        const cc = row.campaignCriterion;
        if (cc?.ageRange?.type) ageRanges.add(cc.ageRange.type);
        if (cc?.gender?.type) genders.add(cc.gender.type);
        if (cc?.location?.geoTargetConstant) locations.add(cc.location.geoTargetConstant);
        if (cc?.language?.languageConstant) languages.add(cc.language.languageConstant);
      }
      if (ageRanges.size || genders.size || locations.size || languages.size) {
        await this.prisma.campaignTargeting.upsert({
          where: { campaignId },
          create: {
            businessId, campaignId, provider: 'google',
            ageRanges: [...ageRanges] as Prisma.InputJsonValue,
            genders: [...genders] as Prisma.InputJsonValue,
            locations: [...locations] as Prisma.InputJsonValue,
            interests: [] as Prisma.InputJsonValue,
            languages: [...languages] as Prisma.InputJsonValue,
            raw: rows as object as Prisma.InputJsonValue,
          },
          update: {
            ageRanges: [...ageRanges] as Prisma.InputJsonValue,
            genders: [...genders] as Prisma.InputJsonValue,
            locations: [...locations] as Prisma.InputJsonValue,
            languages: [...languages] as Prisma.InputJsonValue,
            raw: rows as object as Prisma.InputJsonValue,
          },
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch Google targeting criteria for campaign ${googleCampaignId}: ${err}`);
    }

    // Demographics: age and gender performance (separate views; stored as separate rows)
    try {
      const ageRows = await this.googleQueryAll<GoogleAgeRow>(
        customerId,
        `SELECT ad_group_criterion.age_range.type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
         FROM age_range_view
         WHERE campaign.id = ${googleCampaignId} AND segments.date BETWEEN '${since}' AND '${until}'`,
        headers,
      );
      for (const row of ageRows) {
        const ageRange = row.adGroupCriterion?.ageRange?.type ?? '';
        if (!ageRange) continue;
        await this.upsertGoogleDemographic(businessId, campaignId, ageRange, '', '', row.metrics);
      }

      const genderRows = await this.googleQueryAll<GoogleGenderRow>(
        customerId,
        `SELECT ad_group_criterion.gender.type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
         FROM gender_view
         WHERE campaign.id = ${googleCampaignId} AND segments.date BETWEEN '${since}' AND '${until}'`,
        headers,
      );
      for (const row of genderRows) {
        const gender = row.adGroupCriterion?.gender?.type ?? '';
        if (!gender) continue;
        await this.upsertGoogleDemographic(businessId, campaignId, '', gender, '', row.metrics);
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch Google demographics for campaign ${googleCampaignId}: ${err}`);
    }
  }

  private async upsertGoogleDemographic(
    businessId: string,
    campaignId: string,
    ageRange: string,
    gender: string,
    region: string,
    metrics?: { impressions?: string | number; clicks?: string | number; costMicros?: string | number; conversions?: number },
  ) {
    const impressions = BigInt(Math.round(Number(metrics?.impressions ?? 0)));
    const clicks = BigInt(Math.round(Number(metrics?.clicks ?? 0)));
    const spend = Number(metrics?.costMicros ?? 0) / 1_000_000;
    const conversions = metrics?.conversions != null ? Number(metrics.conversions) : null;
    await this.prisma.campaignDemographic.upsert({
      where: { campaignId_ageRange_gender_region: { campaignId, ageRange, gender, region } },
      create: { businessId, campaignId, ageRange, gender, region, impressions, clicks, spend: spend.toFixed(4), conversions },
      update: { impressions, clicks, spend: spend.toFixed(4), conversions },
    });
  }

  private async resolveGoogleCustomerId(
    adAccount: { id: string; externalAccountId: string; accountName: string },
    accessToken: string,
    devToken: string,
  ): Promise<string> {
    if (adAccount.externalAccountId) return adAccount.externalAccountId;

    const res = await this.jsonFetch<{ resourceNames?: string[] }>(
      `${GOOGLE_API}/customers:listAccessibleCustomers`,
      { headers: this.googleHeaders(accessToken, devToken) },
    );

    const first = res.resourceNames?.[0]; // "customers/1234567890"
    if (!first) {
      throw new BadRequestException(
        'No Google Ads customer accounts found under this OAuth token. ' +
          'Ensure the Google account has access to at least one Google Ads account.',
      );
    }
    const customerId = first.replace('customers/', '').replace(/-/g, '');

    // Fetch the customer name
    let accountName = customerId;
    try {
      const nameRes = await this.jsonFetch<{ results?: Array<{ customer?: { descriptiveName?: string } }> }>(
        `${GOOGLE_API}/customers/${customerId}/googleAds:search`,
        {
          method: 'POST',
          headers: this.googleHeaders(accessToken, devToken),
          body: JSON.stringify({ query: 'SELECT customer.descriptive_name FROM customer LIMIT 1' }),
        },
      );
      accountName = nameRes.results?.[0]?.customer?.descriptiveName ?? customerId;
    } catch { /* non-fatal */ }

    await this.prisma.adAccount.update({
      where: { id: adAccount.id },
      data: { externalAccountId: customerId, accountName },
    });

    return customerId;
  }

  /**
   * Pulls the first headline + first description from one representative responsive
   * search ad under this campaign — Google Ads stores ad copy as arrays of assets,
   * we take the first of each as a stand-in for "what this campaign's ad says".
   */
  private async fetchGoogleCampaignCreative(
    customerId: string,
    campaignId: string,
    headers: Record<string, string>,
  ): Promise<{ headline: string; creativeText: string }> {
    try {
      const rows = await this.googleQueryAll<GoogleAdRow>(
        customerId,
        `SELECT ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions
         FROM ad_group_ad
         WHERE campaign.id = ${campaignId} AND ad_group_ad.status != 'REMOVED'
         LIMIT 1`,
        headers,
      );
      const ad = rows[0]?.adGroupAd?.ad?.responsiveSearchAd;
      const headline = ad?.headlines?.[0]?.text ?? '';
      const creativeText = ad?.descriptions?.[0]?.text ?? '';
      return { headline, creativeText };
    } catch (err) {
      this.logger.warn(`Failed to fetch ad creative for Google campaign ${campaignId}: ${err}`);
      return { headline: '', creativeText: '' };
    }
  }

  private normalizeGoogleMetric(row: GoogleMetricRow): NormalizedMetric | null {
    const seg = row.segments;
    const m = row.metrics;
    if (!seg?.date) return null;

    const costMicros = Number(m?.costMicros ?? 0);
    const spend = costMicros / 1_000_000;
    const impressions = BigInt(Math.round(Number(m?.impressions ?? 0)));
    const clicks = BigInt(Math.round(Number(m?.clicks ?? 0)));
    // Google CTR is a fraction (0.05 = 5%)
    const ctr = m?.ctr != null ? Number(m.ctr) : null;
    const avgCpcMicros = Number(m?.averageCpc ?? 0);
    const cpc = avgCpcMicros > 0 ? (avgCpcMicros / 1_000_000).toFixed(4) : null;
    const conversions = m?.conversions != null ? Number(m.conversions) : null;
    const costPerConvMicros = Number(m?.costPerConversion ?? 0);
    const cpa = costPerConvMicros > 0 ? (costPerConvMicros / 1_000_000).toFixed(4) : null;
    const convValue = Number(m?.conversionsValue ?? 0);
    const roas = convValue > 0 && spend > 0 ? convValue / spend : null;

    return {
      date: parseGoogleDate(seg.date),
      impressions,
      clicks,
      ctr,
      spend: spend > 0 ? spend.toFixed(4) : null,
      conversions,
      cpc,
      cpa,
      reach: null, // reach needs separate report type in Google Ads API
      roas,
    };
  }

  private googleHeaders(accessToken: string, devToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': devToken,
      'Content-Type': 'application/json',
    };
  }

  private async googleQueryAll<T>(
    customerId: string,
    query: string,
    headers: Record<string, string>,
  ): Promise<T[]> {
    const results: T[] = [];
    let pageToken: string | undefined;

    do {
      const body: Record<string, unknown> = { query };
      if (pageToken) body.pageToken = pageToken;

      const res = await this.jsonFetch<{ results?: T[]; nextPageToken?: string }>(
        `${GOOGLE_API}/customers/${customerId}/googleAds:search`,
        { method: 'POST', headers, body: JSON.stringify(body) },
      );

      if (res.results) results.push(...res.results);
      pageToken = res.nextPageToken;
      if (pageToken) await delay(PAGE_DELAY_MS);
    } while (pageToken);

    return results;
  }

  // ── Common upsert helpers ──────────────────────────────────────────────────

  private async upsertCampaign(
    adAccount: { id: string; businessId: string },
    c: NormalizedCampaign,
  ) {
    return this.prisma.campaign.upsert({
      where: { adAccountId_externalCampaignId: { adAccountId: adAccount.id, externalCampaignId: c.externalCampaignId } },
      create: {
        businessId: adAccount.businessId,
        adAccountId: adAccount.id,
        provider: (await this.prisma.adAccount.findUniqueOrThrow({ where: { id: adAccount.id }, select: { provider: true } })).provider,
        externalCampaignId: c.externalCampaignId,
        name: c.name,
        objective: c.objective,
        status: c.status,
        headline: c.headline,
        creativeText: c.creativeText,
        startDate: c.startDate,
        endDate: c.endDate,
        raw: c.raw as Prisma.InputJsonValue,
      },
      update: {
        name: c.name,
        objective: c.objective,
        status: c.status,
        // Only overwrite with a fresh fetch when one was found — keeps the previously
        // synced content if a given sync run failed to refetch the creative.
        ...(c.headline ? { headline: c.headline } : {}),
        ...(c.creativeText ? { creativeText: c.creativeText } : {}),
        startDate: c.startDate,
        endDate: c.endDate,
        raw: c.raw as Prisma.InputJsonValue,
      },
    });
  }

  private async upsertMetric(campaignId: string, m: NormalizedMetric) {
    await this.prisma.campaignMetric.upsert({
      where: { campaignId_date: { campaignId, date: m.date } },
      create: {
        campaignId,
        date: m.date,
        impressions: m.impressions,
        clicks: m.clicks,
        ctr: m.ctr,
        spend: m.spend ?? undefined,
        conversions: m.conversions,
        cpc: m.cpc ?? undefined,
        cpa: m.cpa ?? undefined,
        reach: m.reach,
        roas: m.roas,
      },
      update: {
        impressions: m.impressions,
        clicks: m.clicks,
        ctr: m.ctr,
        spend: m.spend ?? undefined,
        conversions: m.conversions,
        cpc: m.cpc ?? undefined,
        cpa: m.cpa ?? undefined,
        reach: m.reach,
        roas: m.roas,
      },
    });
  }

  // ── HTTP utility ────────────────────────────────────────────────────────────

  private async jsonFetch<T>(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string },
    retried = false,
  ): Promise<T> {
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.headers,
      body: init.body,
    });

    if (res.status === 429 && !retried) {
      this.logger.warn(`Rate limited by ${url} — waiting 62 s then retrying`);
      await delay(RETRY_AFTER_MS);
      return this.jsonFetch<T>(url, init, true);
    }

    const json = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      const fbMsg = (json.error as { message?: string } | undefined)?.message;
      const googleMsg = (json.error as { message?: string } | undefined)?.message
        ?? (json as Record<string, string>).error_description;
      throw new BadRequestException(`Ad API error (${res.status}): ${fbMsg ?? googleMsg ?? JSON.stringify(json)}`);
    }

    return json as T;
  }
}

// ── Facebook API shape helpers ───────────────────────────────────────────────

interface FbCampaign {
  id: string;
  name: string;
  objective?: string;
  status?: string;
  start_time?: string;
  stop_time?: string;
}

interface FbAd {
  creative?: {
    title?: string;
    body?: string;
    object_story_spec?: {
      link_data?: { name?: string; message?: string; description?: string };
      video_data?: { title?: string; message?: string };
    };
  };
}

interface FbAdset {
  targeting?: {
    age_min?: number;
    age_max?: number;
    genders?: number[];
    geo_locations?: {
      countries?: string[];
      cities?: Array<{ name?: string }>;
      regions?: Array<{ name?: string }>;
    };
    flexible_spec?: Array<{ interests?: Array<{ id: string; name: string }> }>;
  };
}

interface FbDemographicRow {
  age?: string;
  gender?: string;
  country?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

interface FbInsightRow {
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  spend?: string;
  cpc?: string;
  date_start: string;
  date_stop: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
}

// ── Google Ads API shape helpers ─────────────────────────────────────────────

interface GoogleCampaignRow {
  campaign: {
    id: string | number;
    name: string;
    status?: string;
    advertisingChannelType?: string;
    startDate?: string;
    endDate?: string;
  };
}

interface GoogleAdRow {
  adGroupAd?: {
    ad?: {
      responsiveSearchAd?: {
        headlines?: Array<{ text?: string }>;
        descriptions?: Array<{ text?: string }>;
      };
    };
  };
}

interface GoogleKeywordRow {
  adGroupCriterion?: {
    keyword?: { text?: string; matchType?: string };
    status?: string;
  };
  metrics?: { impressions?: string | number; clicks?: string | number; costMicros?: string | number; ctr?: number };
}

interface GoogleSearchTermRow {
  searchTermView?: { searchTerm?: string };
  metrics?: { impressions?: string | number; clicks?: string | number; costMicros?: string | number };
}

interface GoogleCriterionRow {
  campaignCriterion?: {
    type?: string;
    negative?: boolean;
    ageRange?: { type?: string };
    gender?: { type?: string };
    location?: { geoTargetConstant?: string };
    language?: { languageConstant?: string };
  };
}

interface GoogleAgeRow {
  adGroupCriterion?: { ageRange?: { type?: string } };
  metrics?: { impressions?: string | number; clicks?: string | number; costMicros?: string | number; conversions?: number };
}

interface GoogleGenderRow {
  adGroupCriterion?: { gender?: { type?: string } };
  metrics?: { impressions?: string | number; clicks?: string | number; costMicros?: string | number; conversions?: number };
}

interface GoogleMetricRow {
  campaign?: { id: string | number };
  segments?: { date?: string };
  metrics?: {
    impressions?: string | number;
    clicks?: string | number;
    ctr?: number;
    costMicros?: string | number;
    averageCpc?: string | number;
    conversions?: number;
    costPerConversion?: string | number;
    conversionsValue?: number;
    reachMetrics?: unknown;
  };
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + n);
  return result;
}

/** Parse Google's "YYYY-MM-DD" date string as UTC midnight. */
function parseGoogleDate(s: string): Date {
  const [y, mo, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
