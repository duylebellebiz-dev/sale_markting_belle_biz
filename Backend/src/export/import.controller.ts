import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ImportService } from './import.service';
import { ImportInvoiceService } from './import-invoice.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import { CommitImportDto } from './dto/commit-import.dto';
import { CommitInvoiceImportDto } from './dto/commit-invoice-import.dto';

const UPLOAD_LIMITS = {
  fileSize: 10 * 1024 * 1024, // 10 MB
};

const ALLOWED_MIMETYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // browsers sometimes send these for CSV
  'application/octet-stream',
  'text/plain',
]);

@Controller('import')
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly importInvoiceService: ImportInvoiceService,
  ) {}

  /** Download a blank .xlsx template with the correct column headers. */
  @Get('customers/template')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.importService.generateTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="customers-import-template.xlsx"',
    );
    res.send(buffer);
  }

  /**
   * Parse + validate the uploaded file.
   * Returns per-row results (valid / duplicate / error) WITHOUT writing to the DB.
   */
  @RequirePermission('importData')
  @Post('customers/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: undefined, // keep in memory (multer MemoryStorage default)
      limits: UPLOAD_LIMITS,
      fileFilter: (_req, file, cb) => {
        const ok =
          ALLOWED_MIMETYPES.has(file.mimetype) ||
          file.originalname.toLowerCase().endsWith('.csv') ||
          file.originalname.toLowerCase().endsWith('.xlsx');
        cb(ok ? null : new Error('Unsupported file type'), ok);
      },
    }),
  )
  preview(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      return { error: 'No file uploaded. Send the file in a multipart field named "file".' };
    }
    return this.importService.preview(user, file);
  }

  /**
   * Insert valid rows into the DB.
   * `duplicateAction`: 'skip' (default) or 'update'.
   */
  @RequirePermission('importData')
  @Post('customers/commit')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: undefined,
      limits: UPLOAD_LIMITS,
      fileFilter: (_req, file, cb) => {
        const ok =
          ALLOWED_MIMETYPES.has(file.mimetype) ||
          file.originalname.toLowerCase().endsWith('.csv') ||
          file.originalname.toLowerCase().endsWith('.xlsx');
        cb(ok ? null : new Error('Unsupported file type'), ok);
      },
    }),
  )
  commit(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CommitImportDto,
  ) {
    if (!file) {
      return { error: 'No file uploaded. Send the file in a multipart field named "file".' };
    }
    return this.importService.commit(user, file, {
      duplicateAction: dto.duplicateAction ?? 'skip',
    });
  }

  // ── Invoice import ─────────────────────────────────────────────────────────

  /** Download a blank .xlsx invoice import template. */
  @Get('invoices/template')
  async downloadInvoiceTemplate(@Res() res: Response) {
    const buffer = await this.importInvoiceService.generateTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="invoices-import-template.xlsx"',
    );
    res.send(buffer);
  }

  /** Parse + validate invoice file, return per-row preview without DB writes. */
  @RequirePermission('importData')
  @Post('invoices/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: undefined,
      limits: UPLOAD_LIMITS,
      fileFilter: (_req, file, cb) => {
        const ok =
          ALLOWED_MIMETYPES.has(file.mimetype) ||
          file.originalname.toLowerCase().endsWith('.csv') ||
          file.originalname.toLowerCase().endsWith('.xlsx');
        cb(ok ? null : new Error('Unsupported file type'), ok);
      },
    }),
  )
  previewInvoices(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      return { error: 'No file uploaded. Send the file in a multipart field named "file".' };
    }
    return this.importInvoiceService.preview(user, file);
  }

  /** Insert / update invoice rows after user confirmation. */
  @RequirePermission('importData')
  @Post('invoices/commit')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: undefined,
      limits: UPLOAD_LIMITS,
      fileFilter: (_req, file, cb) => {
        const ok =
          ALLOWED_MIMETYPES.has(file.mimetype) ||
          file.originalname.toLowerCase().endsWith('.csv') ||
          file.originalname.toLowerCase().endsWith('.xlsx');
        cb(ok ? null : new Error('Unsupported file type'), ok);
      },
    }),
  )
  commitInvoices(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CommitInvoiceImportDto,
  ) {
    if (!file) {
      return { error: 'No file uploaded. Send the file in a multipart field named "file".' };
    }
    return this.importInvoiceService.commit(user, file, {
      duplicateAction:      dto.duplicateAction      ?? 'skip',
      unknownClientAction:  dto.unknownClientAction  ?? 'skip',
    });
  }
}
