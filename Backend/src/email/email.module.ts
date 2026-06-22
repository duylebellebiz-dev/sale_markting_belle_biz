import { Module } from '@nestjs/common';
import { EmailTemplateService } from './email-template.service';
import { EmailCampaignService } from './email-campaign.service';
import { EmailTrackingService } from './email-tracking.service';
import { EmailService } from './email.service';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailSendController } from './email-send.controller';
import { EmailTrackingController } from './email-tracking.controller';

@Module({
  controllers: [
    EmailTemplatesController,
    EmailSendController,
    EmailTrackingController,
  ],
  providers: [
    EmailTemplateService,
    EmailCampaignService,
    EmailTrackingService,
    EmailService,
  ],
  exports: [
    EmailTemplateService,
    EmailCampaignService,
    EmailTrackingService,
    EmailService,
  ],
})
export class EmailModule {}
