import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateSubscriptionDto) {
    return this.subscriptionsService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.subscriptionsService.findAll(user);
  }

  @Get('by-customer/:customerId')
  findByCustomer(
    @CurrentUser() user: RequestUser,
    @Param('customerId') customerId: string,
  ) {
    return this.subscriptionsService.findByCustomer(user, customerId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.subscriptionsService.findOne(user, id);
  }

  @Post(':id/renew')
  renew(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: RenewSubscriptionDto,
  ) {
    return this.subscriptionsService.renew(user, id, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.subscriptionsService.cancel(user, id);
  }
}
