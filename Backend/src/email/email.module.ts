import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailTemplateService } from './email-template.service';
import { EmailCampaignService } from './email-campaign.service';
import { EmailTrackingService } from './email-tracking.service';
import { MailgunEmailService } from './mailgun-email.service';
import { GmailService } from './gmail.service';
import { EmailThreadsService } from './email-threads.service';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailSendController } from './email-send.controller';
import { EmailTrackingController } from './email-tracking.controller';
import { GmailController } from './gmail.controller';
import { EmailThreadsController } from './email-threads.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [
    EmailTemplatesController,
    EmailSendController,
    EmailTrackingController,
    GmailController,
    EmailThreadsController,
  ],
  providers: [
    EmailTemplateService,
    EmailCampaignService,
    EmailTrackingService,
    MailgunEmailService,
    GmailService,
    EmailThreadsService,
  ],
  exports: [
    EmailTemplateService,
    EmailCampaignService,
    EmailTrackingService,
    MailgunEmailService,
    GmailService,
  ],
})
export class EmailModule {}
