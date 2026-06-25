import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { RescheduleFollowUpDto } from './dto/reschedule-followup.dto';
import { CloseLostDto } from './dto/close-lost.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @RequirePermission('manageCustomers')
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user, dto);
  }

  // GET is open to all authenticated users; data scoping is enforced in the service
  // (salesperson sees only their own unless viewAllCustomers is set)
  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.customersService.findAll(user);
  }

  // Must be before :id to avoid route conflicts
  @Get('search')
  search(
    @CurrentUser() user: RequestUser,
    @Query('q') q = '',
    @Query('limit') limit?: string,
  ) {
    return this.customersService.search(user, q, limit ? parseInt(limit, 10) : 20);
  }

  @Get(':id/follow-up-history')
  getFollowUpHistory(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.customersService.getFollowUpHistory(user, id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.customersService.findOne(user, id);
  }

  @RequirePermission('manageCustomers')
  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(user, id, dto);
  }

  @RequirePermission('manageCustomers')
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.customersService.remove(user, id);
  }

  // Follow-up reschedule counts as a customer write
  @RequirePermission('manageCustomers')
  @Post(':id/reschedule')
  rescheduleFollowUp(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: RescheduleFollowUpDto,
  ) {
    return this.customersService.rescheduleFollowUp(user, id, dto);
  }

  @RequirePermission('manageCustomers')
  @Post(':id/close-lost')
  closeLost(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CloseLostDto,
  ) {
    return this.customersService.closeLost(user, id, dto);
  }
}
