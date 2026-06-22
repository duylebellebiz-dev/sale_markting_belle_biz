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
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
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

  // ── SMTP settings: send campaigns from the business's own mailbox ──────────

  /**
   * GET /businesses/settings/email
   * Returns the configured SMTP host/port/user/fromName (never the password).
   */
  @Roles('owner')
  @Get('settings/email')
  getSmtpSettings(@CurrentUser() user: RequestUser) {
    return this.businessesService.getSmtpSettings(user.businessId);
  }

  /**
   * PATCH /businesses/settings/email
   * Owner sets/replaces SMTP credentials for their own mailbox (e.g. Gmail
   * with an App Password). Stored encrypted. Falls back to Resend if unset.
   */
  @Roles('owner')
  @Patch('settings/email')
  async setSmtpSettings(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateSmtpSettingsDto,
  ) {
    const data = await this.businessesService.setSmtpSettings(
      user.businessId,
      dto,
    );
    return { data, message: 'Email sender settings saved successfully' };
  }

  /**
   * DELETE /businesses/settings/email
   * Clears the SMTP config — campaigns fall back to the shared Resend sender.
   */
  @Roles('owner')
  @Delete('settings/email')
  async clearSmtpSettings(@CurrentUser() user: RequestUser) {
    const data = await this.businessesService.clearSmtpSettings(
      user.businessId,
    );
    return { data, message: 'Email sender settings cleared' };
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
