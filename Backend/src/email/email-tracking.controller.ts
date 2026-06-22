import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  Req,
  Res,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import { EmailTrackingService } from './email-tracking.service';

@Controller('email')
export class EmailTrackingController {
  constructor(private readonly trackingService: EmailTrackingService) {}

  // ---------------------------------------------------------------------------
  // Public: open-tracking pixel
  // GET /email/track/open/:emailLogId
  // Returns a 1×1 transparent GIF and records the open event.
  // ---------------------------------------------------------------------------
  @Public()
  @Get('track/open/:emailLogId')
  async trackOpen(
    @Param('emailLogId') logId: string,
    @Res() res: Response,
  ): Promise<void> {
    const gif = await this.trackingService.recordOpen(logId);
    res.set({
      'Content-Type': 'image/gif',
      'Content-Length': gif.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });
    res.end(gif);
  }

  // ---------------------------------------------------------------------------
  // Public: click-tracking redirect
  // GET /email/track/click/:emailLogId?url=<encoded-destination>
  // Records the click then 302-redirects to the original URL.
  // ---------------------------------------------------------------------------
  @Public()
  @Get('track/click/:emailLogId')
  async trackClick(
    @Param('emailLogId') logId: string,
    @Query('url') url: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const destination = await this.trackingService.recordClick(logId, url);
    res.redirect(302, destination);
  }

  // ---------------------------------------------------------------------------
  // Public: Resend delivery/bounce/complaint webhook
  // POST /email/webhook/resend
  // Resend signs every request with Svix headers; we verify before processing.
  // ---------------------------------------------------------------------------
  @Public()
  @Post('webhook/resend')
  async resendWebhook(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body));
    return this.trackingService.handleResendWebhook(
      rawBody,
      req.headers as Record<string, string | string[] | undefined>,
    );
  }

  // ---------------------------------------------------------------------------
  // JWT-protected: customer email history
  // GET /email/history/:customerId
  // Scoped by businessId so a salesperson can only see their own customers' mail.
  // ---------------------------------------------------------------------------
  @Get('history/:customerId')
  async getHistory(
    @CurrentUser() user: RequestUser,
    @Param('customerId') customerId: string,
  ) {
    const data = await this.trackingService.getCustomerHistory(
      user,
      customerId,
    );
    return { data };
  }

  // ---------------------------------------------------------------------------
  // JWT-protected: campaign statistics
  // GET /email/campaigns/:id/stats
  // ---------------------------------------------------------------------------
  @Get('campaigns/:id/stats')
  async getCampaignStats(
    @CurrentUser() user: RequestUser,
    @Param('id') campaignId: string,
  ) {
    const data = await this.trackingService.getCampaignStats(
      user.businessId,
      campaignId,
    );
    return { data };
  }

  // ---------------------------------------------------------------------------
  // JWT-protected: aggregate stats for all campaigns that used a template
  // GET /email/templates/:id/stats
  // ---------------------------------------------------------------------------
  @Get('templates/:id/stats')
  async getTemplateStats(
    @CurrentUser() user: RequestUser,
    @Param('id') templateId: string,
  ) {
    const data = await this.trackingService.getTemplateStats(
      user.businessId,
      templateId,
    );
    return { data };
  }
}
