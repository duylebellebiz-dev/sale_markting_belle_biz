import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { AdOAuthService } from './ad-oauth.service';
import { AdSyncService } from './ad-sync.service';
import { AdImportService, type AdImportProvider } from './ad-import.service';
import { AdAnalyzeService } from './ad-analyze.service';
import { AdReportService } from './ad-report.service';
import { AdChatService } from './ad-chat.service';
import { AdBatchAnalyzeService } from './ad-batch-analyze.service';
import { AdBatchChatService } from './ad-batch-chat.service';

const FRONTEND_URL = () => process.env.FRONTEND_URL ?? 'http://localhost:5173';

const ALLOWED_IMPORT_TYPES = new Set([
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);
const MAX_IMPORT_BYTES = 10 * 1024 * 1024; // 10 MB

@Controller('ads')
export class AdsController {
  private readonly logger = new Logger(AdsController.name);

  constructor(
    private readonly oauthService: AdOAuthService,
    private readonly syncService: AdSyncService,
    private readonly importService: AdImportService,
    private readonly analyzeService: AdAnalyzeService,
    private readonly reportService: AdReportService,
    private readonly chatService: AdChatService,
    private readonly batchAnalyzeService: AdBatchAnalyzeService,
    private readonly batchChatService: AdBatchChatService,
  ) {}

  // ── GET /ads/connections — list the CURRENT user's own OAuth logins ────────
  // One connection = one login; it may expose many fanpages/ad accounts (see below).

  @RequirePermission('analyzeAds')
  @Get('connections')
  listConnections(@CurrentUser() user: RequestUser) {
    return this.oauthService.listConnections(user.businessId, user.userId);
  }

  // ── DELETE /ads/connections/:id — revoke an OAuth login entirely ───────────

  @RequirePermission('analyzeAds')
  @Delete('connections/:id')
  async disconnectConnection(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.oauthService.disconnectConnection(id, user.businessId, user.userId);
    return { message: 'Connection disconnected' };
  }

  // ── GET /ads/accounts — list ad accounts/fanpages VISIBLE to the current user ─
  // Owners see every account in the business. Staff see accounts from connections
  // they personally own, plus any account explicitly shared with them.

  @RequirePermission('analyzeAds')
  @Get('accounts')
  listAccounts(@CurrentUser() user: RequestUser) {
    return this.oauthService.listAccounts(user.businessId, user.userId, user.role === 'owner');
  }

  // ── DELETE /ads/accounts/:id — stop tracking ONE fanpage (keeps the connection) ─

  @RequirePermission('analyzeAds')
  @Delete('accounts/:id')
  async disconnect(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.oauthService.disconnectAccount(id, user.businessId, user.userId, user.role === 'owner');
    return { message: 'Ad account disconnected' };
  }

  // ── Sharing: let a teammate view/sync one fanpage without their own OAuth login ─
  // Only the owner or the connecting staff member can grant/revoke this.

  @RequirePermission('analyzeAds')
  @Post('accounts/:id/share')
  shareAccount(
    @Param('id') id: string,
    @Body('userId') granteeUserId: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!granteeUserId) throw new BadRequestException('userId is required in the request body');
    return this.oauthService.shareAccount(id, granteeUserId, user.businessId, user.userId, user.role === 'owner');
  }

  @RequirePermission('analyzeAds')
  @Delete('accounts/:id/share/:userId')
  async revokeAccess(
    @Param('id') id: string,
    @Param('userId') granteeUserId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.oauthService.revokeAccess(id, granteeUserId, user.businessId, user.userId, user.role === 'owner');
    return { message: 'Access revoked' };
  }

  // ── Connect OAuth — returns auth URL; user/staff must have analyzeAds ──────
  // Uses the ONE shared app credential set (FB_APP_ID/SECRET, GOOGLE_CLIENT_ID/SECRET)
  // from .env, but the resulting token is stored against THIS user only. All
  // fanpages/ad accounts reachable by that login are auto-discovered on connect —
  // a staff member managing several fanpages only authorizes once.

  @RequirePermission('analyzeAds')
  @Get('connect/facebook')
  connectFacebook(@CurrentUser() user: RequestUser) {
    return { authUrl: this.oauthService.buildFacebookAuthUrl(user.businessId, user.userId) };
  }

  @RequirePermission('analyzeAds')
  @Get('connect/google')
  connectGoogle(@CurrentUser() user: RequestUser) {
    return { authUrl: this.oauthService.buildGoogleAuthUrl(user.businessId, user.userId) };
  }

  // ── OAuth callbacks — PUBLIC (browser redirects from FB/Google) ────────────

  @Public()
  @Get('connect/facebook/callback')
  async facebookCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.redirect(
        `${FRONTEND_URL()}/ad-accounts?error=${encodeURIComponent('Facebook authorization was denied or cancelled.')}`,
      );
    }
    if (!code || !state) {
      return res.redirect(
        `${FRONTEND_URL()}/ad-accounts?error=${encodeURIComponent('Missing code or state from Facebook.')}`,
      );
    }
    try {
      const { accountsFound } = await this.oauthService.handleFacebookCallback(code, state);
      return res.redirect(`${FRONTEND_URL()}/ad-accounts?connected=facebook&found=${accountsFound}`);
    } catch (err: unknown) {
      const msg = err instanceof BadRequestException ? err.message : 'Failed to connect Facebook.';
      this.logger.error(`Facebook callback: ${err}`);
      return res.redirect(`${FRONTEND_URL()}/ad-accounts?error=${encodeURIComponent(msg)}`);
    }
  }

  @Public()
  @Get('connect/google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.redirect(
        `${FRONTEND_URL()}/ad-accounts?error=${encodeURIComponent('Google authorization was denied or cancelled.')}`,
      );
    }
    if (!code || !state) {
      return res.redirect(
        `${FRONTEND_URL()}/ad-accounts?error=${encodeURIComponent('Missing code or state from Google.')}`,
      );
    }
    try {
      const { accountsFound } = await this.oauthService.handleGoogleCallback(code, state);
      return res.redirect(`${FRONTEND_URL()}/ad-accounts?connected=google&found=${accountsFound}`);
    } catch (err: unknown) {
      const msg = err instanceof BadRequestException ? err.message : 'Failed to connect Google.';
      this.logger.error(`Google callback: ${err}`);
      return res.redirect(`${FRONTEND_URL()}/ad-accounts?error=${encodeURIComponent(msg)}`);
    }
  }

  // ── POST /ads/sync/:adAccountId — pull live data from provider API ─────────

  @RequirePermission('analyzeAds')
  @Post('sync/:adAccountId')
  sync(@Param('adAccountId') adAccountId: string, @CurrentUser() user: RequestUser) {
    return this.syncService.sync(adAccountId, user.businessId, user.userId, user.role === 'owner');
  }

  // ── GET /ads/campaigns — list synced campaigns with metrics ───────────────
  // dateFrom/dateTo (YYYY-MM-DD, both required together) scope the metrics to a
  // reporting period; omit both to get the default "last 30 synced days" view.

  @RequirePermission('analyzeAds')
  @Get('campaigns')
  listCampaigns(
    @CurrentUser() user: RequestUser,
    @Query('adAccountId') adAccountId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.syncService.listCampaigns(
      user.businessId,
      user.userId,
      user.role === 'owner',
      adAccountId,
      dateFrom ? new Date(dateFrom) : undefined,
      dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : undefined,
    );
  }

  // ── GET /ads/campaigns/:id/audience — keywords, targeting, demographics ───

  @RequirePermission('analyzeAds')
  @Get('campaigns/:id/audience')
  getAudience(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.syncService.getAudienceData(id, user.businessId, user.userId, user.role === 'owner');
  }

  // ── GET /ads/campaigns/export.xlsx — one-row-per-campaign report, same filters ─

  @RequirePermission('analyzeAds')
  @Get('campaigns/export.xlsx')
  async exportCampaigns(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
    @Query('adAccountId') adAccountId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    await this.reportService.streamCampaignsXlsx(
      user.businessId,
      user.userId,
      user.role === 'owner',
      res,
      adAccountId,
      dateFrom ? new Date(dateFrom) : undefined,
      dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : undefined,
    );
  }

  // ── POST /ads/campaigns/:id/analyze — AI analysis via Claude API ───────────

  @RequirePermission('analyzeAds')
  @Post('campaigns/:id/analyze')
  analyzeCampaign(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.analyzeService.analyze(id, user.businessId, user.userId, user.role === 'owner');
  }

  // ── GET /ads/campaigns/:id/analyses — analysis history ─────────────────────

  @RequirePermission('analyzeAds')
  @Get('campaigns/:id/analyses')
  listAnalyses(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.analyzeService.listAnalyses(id, user.businessId, user.userId, user.role === 'owner');
  }

  // ── DELETE /ads/campaigns/:id/analyses/:analysisId — remove one old report ──

  @RequirePermission('analyzeAds')
  @Delete('campaigns/:id/analyses/:analysisId')
  async deleteAnalysis(
    @Param('id') id: string,
    @Param('analysisId') analysisId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.analyzeService.deleteAnalysis(analysisId, id, user.businessId, user.userId, user.role === 'owner');
    return { message: 'Analysis deleted' };
  }

  // ── Free-form AI chat about a campaign — ask anything, any language ────────
  // ("what should the ad copy say?", "phân tích chỗ này giúp tôi", "¿qué título usar?")

  @RequirePermission('analyzeAds')
  @Get('campaigns/:id/chat')
  listChatMessages(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.chatService.listMessages(id, user.businessId, user.userId, user.role === 'owner');
  }

  @RequirePermission('analyzeAds')
  @Post('campaigns/:id/chat')
  sendChatMessage(
    @Param('id') id: string,
    @Body('message') message: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!message) throw new BadRequestException('message is required in the request body');
    return this.chatService.sendMessage(id, user.businessId, user.userId, user.role === 'owner', message);
  }

  // ── DELETE /ads/campaigns/:id/chat — clear the whole chat thread ───────────

  @RequirePermission('analyzeAds')
  @Delete('campaigns/:id/chat')
  async clearChatHistory(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.chatService.clearHistory(id, user.businessId, user.userId, user.role === 'owner');
    return { message: 'Chat history cleared' };
  }

  // ── Cross-campaign AI analysis — compare several campaigns at once ─────────

  @RequirePermission('analyzeAds')
  @Post('campaigns/analyze-batch')
  analyzeBatch(@Body('campaignIds') campaignIds: string[], @CurrentUser() user: RequestUser) {
    if (!Array.isArray(campaignIds) || !campaignIds.length) {
      throw new BadRequestException('campaignIds (array) is required in the request body');
    }
    return this.batchAnalyzeService.analyze(campaignIds, user.businessId, user.userId, user.role === 'owner');
  }

  @RequirePermission('analyzeAds')
  @Get('batch-analyses')
  listBatchAnalyses(@CurrentUser() user: RequestUser) {
    return this.batchAnalyzeService.listAnalyses(user.businessId, user.userId, user.role === 'owner');
  }

  @RequirePermission('analyzeAds')
  @Delete('batch-analyses/:id')
  async deleteBatchAnalysis(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.batchAnalyzeService.deleteAnalysis(id, user.businessId, user.userId, user.role === 'owner');
    return { message: 'Analysis deleted' };
  }

  // ── GET /ads/campaigns/:id/report.pdf|.xlsx — downloadable analysis report ─

  @RequirePermission('analyzeAds')
  @Get('batch-analyses/:id/chat')
  listBatchChatMessages(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.batchChatService.listMessages(id, user.businessId, user.userId, user.role === 'owner');
  }

  @RequirePermission('analyzeAds')
  @Post('batch-analyses/:id/chat')
  sendBatchChatMessage(
    @Param('id') id: string,
    @Body('message') message: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!message) throw new BadRequestException('message is required in the request body');
    return this.batchChatService.sendMessage(id, user.businessId, user.userId, user.role === 'owner', message);
  }

  @RequirePermission('analyzeAds')
  @Delete('batch-analyses/:id/chat')
  async clearBatchChatHistory(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.batchChatService.clearHistory(id, user.businessId, user.userId, user.role === 'owner');
    return { message: 'Chat history cleared' };
  }

  @RequirePermission('analyzeAds')
  @Get('campaigns/:id/report.pdf')
  async getReportPdf(@Param('id') id: string, @CurrentUser() user: RequestUser, @Res() res: Response) {
    await this.reportService.streamPdf(id, user.businessId, user.userId, user.role === 'owner', res);
  }

  @RequirePermission('analyzeAds')
  @Get('campaigns/:id/report.xlsx')
  async getReportXlsx(@Param('id') id: string, @CurrentUser() user: RequestUser, @Res() res: Response) {
    await this.reportService.streamXlsx(id, user.businessId, user.userId, user.role === 'owner', res);
  }

  // ── CSV / Excel fallback import ────────────────────────────────────────────
  //
  // Allows users to upload an export from Facebook Ads Manager or Google Ads
  // so they can test analysis features before completing App Review.
  //
  // provider = 'facebook' | 'google'
  //
  // GET  /ads/import/template/:provider  — download blank template
  // POST /ads/import/preview/:provider   — validate file, return row preview (no writes)
  // POST /ads/import/commit/:provider    — write to DB
  //   Body: multipart/form-data  field: file, adAccountId

  @Roles('owner')
  @Get('import/template/:provider')
  async downloadTemplate(
    @Param('provider') provider: string,
    @Res() res: Response,
  ) {
    const p = this.validateProvider(provider);
    await this.importService.buildTemplate(p, res);
  }

  @RequirePermission('analyzeAds')
  @Post('import/preview/:provider')
  @UseInterceptors(FileInterceptor('file'))
  async previewImport(
    @Param('provider') provider: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const p = this.validateProvider(provider);
    this.validateFile(file);
    return this.importService.preview(file.buffer, file.mimetype, p);
  }

  @RequirePermission('analyzeAds')
  @Post('import/commit/:provider')
  @UseInterceptors(FileInterceptor('file'))
  async commitImport(
    @Param('provider') provider: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('adAccountId') adAccountId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const p = this.validateProvider(provider);
    this.validateFile(file);
    if (!adAccountId) throw new BadRequestException('adAccountId query param is required');
    const canAccess = await this.oauthService.canAccessAccount(adAccountId, user.businessId, user.userId, user.role === 'owner');
    if (!canAccess) throw new BadRequestException('Ad account not found, or you do not have access to it.');
    return this.importService.commit(file.buffer, file.mimetype, p, adAccountId, user.businessId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private validateProvider(provider: string): AdImportProvider {
    if (provider !== 'facebook' && provider !== 'google') {
      throw new BadRequestException('provider must be "facebook" or "google"');
    }
    return provider as AdImportProvider;
  }

  private validateFile(file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (file.size > MAX_IMPORT_BYTES) {
      throw new BadRequestException('File exceeds 10 MB limit');
    }
    if (!ALLOWED_IMPORT_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only CSV or Excel (.xlsx) files are accepted');
    }
  }
}
