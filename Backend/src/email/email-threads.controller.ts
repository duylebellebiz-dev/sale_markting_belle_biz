import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { EmailThreadsService } from './email-threads.service';
import { ReplyThreadDto } from './dto/reply-thread.dto';
import { LinkUnmatchedDto } from './dto/link-unmatched.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@Controller('email/threads')
export class EmailThreadsController {
  constructor(private readonly threadsService: EmailThreadsService) {}

  /** GET /email/threads/unmatched — must come before :customerId so it isn't swallowed by the param route. */
  @Get('unmatched')
  async listUnmatched(@CurrentUser() user: RequestUser) {
    const data = await this.threadsService.listUnmatched(user);
    return { data };
  }

  @Patch('unmatched/:messageId/link')
  async linkUnmatched(
    @CurrentUser() user: RequestUser,
    @Param('messageId') messageId: string,
    @Body() dto: LinkUnmatchedDto,
  ) {
    const data = await this.threadsService.linkUnmatched(user, messageId, dto.customerId);
    return { data, message: 'Reply linked to customer' };
  }

  @Get(':customerId')
  async getThread(@CurrentUser() user: RequestUser, @Param('customerId') customerId: string) {
    const data = await this.threadsService.getThread(user, customerId);
    return { data };
  }

  @RequirePermission('sendEmail')
  @Post(':customerId/reply')
  async reply(
    @CurrentUser() user: RequestUser,
    @Param('customerId') customerId: string,
    @Body() dto: ReplyThreadDto,
  ) {
    const data = await this.threadsService.reply(user, customerId, dto);
    return { data, message: 'Reply sent' };
  }
}
