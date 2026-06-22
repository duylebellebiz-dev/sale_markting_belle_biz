import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ExportService } from './export.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @RequirePermission('exportExcel')
  @Get('customers')
  exportCustomers(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return this.exportService.exportCustomers(user, res);
  }
}
