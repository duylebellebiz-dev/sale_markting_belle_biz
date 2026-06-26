import { BadRequestException, Controller, Delete, Get, Logger, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GmailService } from './gmail.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

const FRONTEND_URL = () => process.env.FRONTEND_URL?.split(',')[0] ?? 'http://localhost:5173';

@Controller('email/gmail')
export class GmailController {
  private readonly logger = new Logger(GmailController.name);

  constructor(private readonly gmailService: GmailService) {}

  /** GET /email/gmail/status — connection state for the settings UI. */
  @Roles('owner')
  @Get('status')
  async getStatus(@CurrentUser() user: RequestUser) {
    const data = await this.gmailService.getConnection(user.businessId);
    return { data: data ?? { status: 'disconnected' } };
  }

  /** GET /email/gmail/connect — owner only; returns the Google OAuth URL. */
  @Roles('owner')
  @Get('connect')
  connect(@CurrentUser() user: RequestUser) {
    return { authUrl: this.gmailService.buildAuthUrl(user.businessId) };
  }

  /** GET /email/gmail/callback — PUBLIC (browser redirect from Google). */
  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      return res.redirect(
        `${FRONTEND_URL()}/email-sender-settings?error=${encodeURIComponent('Google authorization was denied or cancelled.')}`,
      );
    }
    if (!code || !state) {
      return res.redirect(
        `${FRONTEND_URL()}/email-sender-settings?error=${encodeURIComponent('Missing code or state from Google.')}`,
      );
    }
    try {
      const { emailAddress } = await this.gmailService.handleCallback(code, state);
      return res.redirect(
        `${FRONTEND_URL()}/email-sender-settings?connected=gmail&email=${encodeURIComponent(emailAddress)}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof BadRequestException ? err.message : 'Failed to connect Gmail.';
      this.logger.error(`Gmail callback: ${err}`);
      return res.redirect(`${FRONTEND_URL()}/email-sender-settings?error=${encodeURIComponent(msg)}`);
    }
  }

  /** DELETE /email/gmail/disconnect — owner only. */
  @Roles('owner')
  @Delete('disconnect')
  async disconnect(@CurrentUser() user: RequestUser) {
    await this.gmailService.disconnect(user.businessId);
    return { message: 'Gmail disconnected' };
  }
}
