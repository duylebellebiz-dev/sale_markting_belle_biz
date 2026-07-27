import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { UpdateClaudeKeyDto } from './dto/update-claude-key.dto';
import { UpdateMailgunSettingsDto } from './dto/update-mailgun-settings.dto';
import { UpdateSavedEmailsDto } from './dto/update-saved-emails.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { BusinessesService } from './businesses.service';
import { UpdateReminderScheduleDto } from './dto/update-reminder-schedule.dto';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Get('me')
  getMyBusiness(@CurrentUser() user: RequestUser) {
    return this.businessesService.getMyBusiness(user.businessId);
  }

  @Roles('owner')
  @Get('me/reminder-schedule')
  getReminderSchedule(@CurrentUser() user: RequestUser) {
    return this.businessesService.getReminderSchedule(user.businessId);
  }

  @Roles('owner')
  @Patch('me/reminder-schedule')
  updateReminderSchedule(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateReminderScheduleDto,
  ) {
    return this.businessesService.updateReminderSchedule(user.businessId, dto);
  }

  // ── Branding ────────────────────────────────────────────────────────────────

  @Roles('owner')
  @Get('branding')
  getBranding(@CurrentUser() user: RequestUser) {
    return this.businessesService.getBranding(user.businessId);
  }

  @Roles('owner')
  @Patch('branding')
  updateBranding(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateBrandingDto,
  ) {
    return this.businessesService.updateBranding(user.businessId, dto);
  }

  // ── Claude API key settings (§12c.1) ────────────────────────────────────────

  /**
   * GET /businesses/settings/claude-api-key
   * Returns only whether a key is configured — never the key itself.
   */
  @Roles('owner')
  @Get('settings/claude-api-key')
  getClaudeKeyStatus(@CurrentUser() user: RequestUser) {
    return this.businessesService.getClaudeKeyStatus(user.businessId);
  }

  /**
   * PATCH /businesses/settings/claude-api-key
   * Owner sets or replaces the Claude API key. Stored encrypted.
   */
  @Roles('owner')
  @Patch('settings/claude-api-key')
  async setClaudeApiKey(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateClaudeKeyDto,
  ) {
    await this.businessesService.setClaudeApiKey(user.businessId, dto.apiKey);
    return { message: 'Claude API key saved successfully' };
  }

  // ── Per-business Mailgun settings ───────────────────────────────────────────
  // Each business registers its OWN Mailgun account/domain — own quota, own brand —
  // instead of sharing the operator's MAILGUN_API_KEY / MAILGUN_DOMAIN fallback.

  /**
   * GET /businesses/settings/email
   * Returns whether a business-owned Mailgun key is configured, plus domain/fromEmail/fromName.
   * Never returns the key itself.
   */
  @Roles('owner')
  @Get('settings/email')
  getMailgunSettings(@CurrentUser() user: RequestUser) {
    return this.businessesService.getMailgunSettings(user.businessId);
  }

  /**
   * PATCH /businesses/settings/email
   * Owner sets/replaces their own Mailgun API key + sending domain. Stored encrypted.
   */
  @Roles('owner')
  @Patch('settings/email')
  async setMailgunSettings(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateMailgunSettingsDto,
  ) {
    const data = await this.businessesService.setMailgunSettings(user.businessId, dto);
    return { data, message: 'Mailgun sender settings saved successfully' };
  }

  /**
   * DELETE /businesses/settings/email
   * Clears the business's own Mailgun config — sends fall back to the shared operator account.
   */
  @Roles('owner')
  @Delete('settings/email')
  async clearMailgunSettings(@CurrentUser() user: RequestUser) {
    const data = await this.businessesService.clearMailgunSettings(user.businessId);
    return { data, message: 'Mailgun sender settings cleared' };
  }

  // ── Saved CC/BCC quick-pick emails ──────────────────────────────────────────

  /**
   * GET /businesses/settings/saved-emails
   * Any authenticated staff member can read these — they're used as quick-pick
   * options when composing an email, not a sensitive setting.
   */
  @Get('settings/saved-emails')
  getSavedEmails(@CurrentUser() user: RequestUser) {
    return this.businessesService.getSavedEmails(user.businessId);
  }

  /**
   * PATCH /businesses/settings/saved-emails
   * Owner-only — replaces the full saved list.
   */
  @Roles('owner')
  @Patch('settings/saved-emails')
  updateSavedEmails(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateSavedEmailsDto,
  ) {
    return this.businessesService.updateSavedEmails(user.businessId, dto);
  }

  /**
   * POST /businesses/branding/logo
   * Accepts multipart/form-data field "logo" (png or jpg, max 2 MB).
   * Stores to uploads/logos/ and saves the URL path on the Business.
   */
  @Roles('owner')
  @Post('branding/logo')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination(_req, _file, cb) {
          const dir = path.join(process.cwd(), 'uploads', 'logos');
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename(_req, file, cb) {
          const ext = path.extname(file.originalname).toLowerCase() || '.png';
          cb(null, `${crypto.randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_LOGO_BYTES },
      fileFilter(_req, file, cb) {
        if (ALLOWED_LOGO_TYPES.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only PNG or JPG files are allowed'), false);
        }
      },
    }),
  )
  async uploadLogo(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No logo file provided');
    const logoUrl = `/uploads/logos/${file.filename}`;
    const data = await this.businessesService.updateLogo(user.businessId, logoUrl);
    return { data, message: 'Logo uploaded' };
  }
}
