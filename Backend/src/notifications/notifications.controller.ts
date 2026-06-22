import { Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('page')  page  = '1',
    @Query('limit') limit = '20',
  ) {
    return this.notificationsService.findForUser(
      user,
      Math.max(1, parseInt(page,  10) || 1),
      Math.min(50, parseInt(limit, 10) || 20),
    );
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: RequestUser) {
    return this.notificationsService.countUnread(user);
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notificationsService.markRead(user, id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: RequestUser) {
    return this.notificationsService.markAllRead(user);
  }

  @Delete('delete-all')
  deleteAll(@CurrentUser() user: RequestUser) {
    return this.notificationsService.deleteAll(user);
  }

  @Delete(':id')
  deleteOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notificationsService.deleteOne(user, id);
  }
}
