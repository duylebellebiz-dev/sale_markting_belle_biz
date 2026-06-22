import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import { EmailCampaignService } from './email-campaign.service';
import { SendCampaignDto, SegmentFilter } from './dto/send-campaign.dto';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Controller('email')
export class EmailSendController {
  constructor(private readonly campaignService: EmailCampaignService) {}

  /**
   * POST /email/send
   * Accepts multipart/form-data.
   * Non-attachment fields: templateId?, subject?, bodyHtml?, segment? (JSON), scheduledAt?
   * File field name: attachments (up to 5 files, max 10 MB each, pdf/docx/png/jpg only)
   */
  @RequirePermission('sendEmail')
  @Post('send')
  @UseInterceptors(
    FilesInterceptor('attachments', 5, {
      storage: diskStorage({
        destination(_req, _file, cb) {
          const dir = path.join(process.cwd(), 'uploads', 'email-attachments');
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename(_req, file, cb) {
          const ext = path.extname(file.originalname);
          cb(null, `${crypto.randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
      fileFilter(_req, file, cb) {
        cb(null, ALLOWED_MIME_TYPES.has(file.mimetype));
      },
    }),
  )
  async send(
    @CurrentUser() user: RequestUser,
    @Body() dto: SendCampaignDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.campaignService.send(user, dto, files ?? []);
  }

  /**
   * GET /email/daily-cap
   * Returns today's usage and remaining quota so the compose UI can warn
   * before a bulk send would hit the Resend free-tier limit (100/day).
   */
  @Get('daily-cap')
  async getDailyCap(@CurrentUser() user: RequestUser) {
    const remaining = await this.campaignService.getRemainingDailyCap(
      user.businessId,
    );
    return { data: { remaining, used: 100 - remaining, cap: 100 } };
  }

  /**
   * GET /email/segment/count?segment=<JSON>
   * Returns the number of matching customers (with email) for a given segment config.
   * Used by the compose UI to show an accurate recipient count before sending.
   */
  @Get('segment/count')
  async getSegmentCount(
    @CurrentUser() user: RequestUser,
    @Query('segment') segmentJson?: string,
  ) {
    let segment: SegmentFilter = {};
    if (segmentJson) {
      try {
        segment = JSON.parse(segmentJson) as SegmentFilter;
      } catch {
        throw new BadRequestException('segment must be valid JSON');
      }
    }
    const count = await this.campaignService.countSegment(
      user.businessId,
      user.userId,
      user.role,
      segment,
    );
    return { data: { count } };
  }

  /** GET /email/campaigns — list all campaigns for this business */
  @Get('campaigns')
  async listCampaigns(@CurrentUser() user: RequestUser) {
    const data = await this.campaignService.listCampaigns(user.businessId);
    return { data };
  }
}
