import { Module } from '@nestjs/common';
import { BusinessesModule } from '../businesses/businesses.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ClaudeKeyService } from './claude-key.service';
import { AdOAuthService } from './ad-oauth.service';
import { AdSyncService } from './ad-sync.service';
import { AdImportService } from './ad-import.service';
import { AdAnalyzeService } from './ad-analyze.service';
import { AdReportService } from './ad-report.service';
import { AdChatService } from './ad-chat.service';
import { AdBatchAnalyzeService } from './ad-batch-analyze.service';
import { AdBatchChatService } from './ad-batch-chat.service';
import { AdsController } from './ads.controller';

@Module({
  imports: [BusinessesModule, PrismaModule],
  controllers: [AdsController],
  providers: [ClaudeKeyService, AdOAuthService, AdSyncService, AdImportService, AdAnalyzeService, AdReportService, AdChatService, AdBatchAnalyzeService, AdBatchChatService],
  exports: [ClaudeKeyService, AdOAuthService, AdSyncService, AdAnalyzeService, AdReportService, AdChatService, AdBatchAnalyzeService, AdBatchChatService],
})
export class AdAnalysisModule {}
