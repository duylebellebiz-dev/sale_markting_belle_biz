import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import { EmailTemplateService } from './email-template.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

@Controller('email/templates')
export class EmailTemplatesController {
  constructor(private readonly templateService: EmailTemplateService) {}

  @RequirePermission('manageEmailTemplates')
  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateEmailTemplateDto,
  ) {
    const data = await this.templateService.create(
      user.businessId,
      user.userId,
      dto,
    );
    return { data, message: 'Template created' };
  }

  // All staff can read templates to use them when composing
  @Get()
  async findAll(@CurrentUser() user: RequestUser) {
    const data = await this.templateService.findAll(user.businessId);
    return { data };
  }

  @Get(':id')
  async findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const data = await this.templateService.findOne(user.businessId, id);
    return { data };
  }

  @RequirePermission('manageEmailTemplates')
  @Patch(':id')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    const data = await this.templateService.update(user.businessId, id, dto);
    return { data, message: 'Template updated' };
  }

  @RequirePermission('manageEmailTemplates')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.templateService.remove(user.businessId, id);
  }
}
