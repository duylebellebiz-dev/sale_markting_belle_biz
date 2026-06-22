import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @RequirePermission('manageServices')
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateServiceDto) {
    return this.servicesService.create(user.businessId, dto);
  }

  // All authenticated users can read the service catalog (needed for subscriptions)
  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.servicesService.findAll(user.businessId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.servicesService.findOne(user.businessId, id);
  }

  @RequirePermission('manageServices')
  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.servicesService.update(user.businessId, id, dto);
  }

  @RequirePermission('manageServices')
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.servicesService.remove(user.businessId, id);
  }
}
