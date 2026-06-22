import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { parse as csvParse } from 'csv-parse/sync';
import { PrismaService } from '../prisma/prisma.service';
import { PipelineStage } from '../customers/pipeline-stage.enum';
import type { RequestUser } from '../common/decorators/current-user.decorator';

// ─── Column headers that match the import template ───────────────────────────

export const TEMPLATE_COLUMNS = [
  'customerName',
  'shopName',
  'shopAddress',
  'email',
  'phoneNumber',
  'shopPhoneNumber',
  'contactSource',
  'stage',
  'status',
  'note',
  'dateOfContact',
  'assignedSalespersonEmail', // owner-only; ignored for salesperson imports
] as const;

type TemplateColumn = (typeof TEMPLATE_COLUMNS)[number];

const VALID_STAGES = new Set<string>(Object.values(PipelineStage));

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedRow {
  rowNumber: number;
  customerName?: string;
  shopName?: string;
  shopAddress?: string;
  email?: string;
  phoneNumber?: string;
  shopPhoneNumber?: string;
  contactSource?: string;
  stage?: string;
  status?: string;
  note?: string;
  dateOfContact?: string;
  assignedSalespersonEmail?: string;
}

export interface RowResult {
  rowNumber: number;
  status: 'valid' | 'duplicate' | 'error';
  errors?: string[];
  data?: ParsedRow;
  existingId?: string; // set when status === 'duplicate'
}

export interface PreviewResult {
  total: number;
  valid: number;
  duplicates: number;
  errors: number;
  rows: RowResult[];
}

export interface CommitOptions {
  duplicateAction: 'skip' | 'update';
}

export interface CommitResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: { rowNumber: number; reason: string }[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Template ───────────────────────────────────────────────────────────────

  async generateTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Customers Import');

    sheet.columns = [
      { header: 'customerName *',           key: 'customerName',            width: 24 },
      { header: 'shopName',                  key: 'shopName',                width: 24 },
      { header: 'shopAddress',               key: 'shopAddress',             width: 36 },
      { header: 'email',                     key: 'email',                   width: 28 },
      { header: 'phoneNumber',               key: 'phoneNumber',             width: 18 },
      { header: 'shopPhoneNumber',           key: 'shopPhoneNumber',         width: 18 },
      { header: 'contactSource',             key: 'contactSource',           width: 18 },
      { header: 'stage',                     key: 'stage',                   width: 16 },
      { header: 'status',                    key: 'status',                  width: 16 },
      { header: 'note',                      key: 'note',                    width: 36 },
      { header: 'dateOfContact',             key: 'dateOfContact',           width: 18 },
      { header: 'assignedSalespersonEmail',  key: 'assignedSalespersonEmail', width: 32 },
    ];

    // Style header
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.height = 20;
    headerRow.commit();

    // Add a sample row so the user sees the expected format
    sheet.addRow({
      customerName: 'Jane Smith',
      shopName: 'Jane\'s Bakery',
      shopAddress: '11502 Westgate Dr #110, Grande Prairie, T8V 4E9 Alberta, Canada',
      email: 'jane@example.com',
      phoneNumber: '+1-780-555-0100',
      shopPhoneNumber: '+1-780-555-0101',
      contactSource: 'Facebook Ads',
      stage: 'Lead',
      status: 'Potential',
      note: 'Interested in annual plan',
      dateOfContact: '2025-01-15',
      assignedSalespersonEmail: '(owner only — leave blank to assign to yourself)',
    });

    // Notes row
    const notesRow = sheet.addRow({
      customerName: '* Required. All other columns are optional.',
      stage: `Valid values: ${Object.values(PipelineStage).join(', ')}`,
    });
    notesRow.font = { italic: true, color: { argb: 'FF6B7280' } };
    notesRow.commit();

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  // ── Parse raw file bytes into rows ─────────────────────────────────────────

  private async parseFile(
    buffer: Buffer,
    mimetype: string,
    originalname: string,
  ): Promise<ParsedRow[]> {
    const ext = originalname.toLowerCase().split('.').pop();

    if (ext === 'csv' || mimetype === 'text/csv' || mimetype === 'application/csv') {
      return this.parseCsv(buffer);
    }
    if (
      ext === 'xlsx' ||
      mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      return this.parseXlsx(buffer);
    }
    throw new BadRequestException('Unsupported file type. Upload a .xlsx or .csv file.');
  }

  private parseCsv(buffer: Buffer): ParsedRow[] {
    const records: Record<string, string>[] = csvParse(buffer, {
      columns: true,       // use first row as headers
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];

    return records.map((rec, i) => this.normaliseRow(rec, i + 2)); // row 2 = first data row
  }

  private async parseXlsx(buffer: Buffer): Promise<ParsedRow[]> {
    const wb = new ExcelJS.Workbook();
    // ExcelJS types want a legacy Buffer; cast through unknown to satisfy strict TS
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (wb.xlsx.load as (b: any) => Promise<ExcelJS.Workbook>)(buffer);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new BadRequestException('The Excel file has no worksheets.');

    // Read header row to build column→key mapping
    const headerRow = sheet.getRow(1);
    const colMap = new Map<number, string>(); // colIndex → normalised key
    headerRow.eachCell((cell, colIdx) => {
      const raw = String(cell.value ?? '').trim();
      // Strip the " *" marker used in the template header
      const key = raw.replace(/\s*\*$/, '').trim();
      colMap.set(colIdx, key);
    });

    const rows: ParsedRow[] = [];
    sheet.eachRow((row, rowIdx) => {
      if (rowIdx === 1) return; // skip header
      const rec: Record<string, string> = {};
      row.eachCell({ includeEmpty: true }, (cell, colIdx) => {
        const key = colMap.get(colIdx);
        if (key) rec[key] = this.cellText(cell);
      });
      // Skip entirely blank rows
      if (Object.values(rec).every((v) => !v)) return;
      rows.push(this.normaliseRow(rec, rowIdx));
    });
    return rows;
  }

  private cellText(cell: ExcelJS.Cell): string {
    if (cell.value === null || cell.value === undefined) return '';
    if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
    if (typeof cell.value === 'object' && 'result' in (cell.value as object))
      return String((cell.value as { result: unknown }).result ?? '').trim();
    return String(cell.value).trim();
  }

  private normaliseRow(rec: Record<string, string>, rowNumber: number): ParsedRow {
    const get = (key: TemplateColumn) => (rec[key] ?? '').trim();
    return {
      rowNumber,
      customerName: get('customerName') || undefined,
      shopName: get('shopName') || undefined,
      shopAddress: get('shopAddress') || undefined,
      email: get('email') || undefined,
      phoneNumber: get('phoneNumber') || undefined,
      shopPhoneNumber: get('shopPhoneNumber') || undefined,
      contactSource: get('contactSource') || undefined,
      stage: get('stage') || undefined,
      status: get('status') || undefined,
      note: get('note') || undefined,
      dateOfContact: get('dateOfContact') || undefined,
      assignedSalespersonEmail: get('assignedSalespersonEmail') || undefined,
    };
  }

  // ── Validation (per-row, non-throwing) ─────────────────────────────────────

  private validateRow(row: ParsedRow): string[] {
    const errs: string[] = [];
    if (!row.customerName) errs.push('customerName is required');
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
      errs.push(`invalid email: "${row.email}"`);
    if (row.stage && !VALID_STAGES.has(row.stage)) {
      // Will be coerced to Lead — not a hard error, just normalised
    }
    return errs;
  }

  /** Coerce stage: unknown → 'Lead', blank → 'Lead' */
  private coerceStage(raw?: string): PipelineStage {
    if (raw && VALID_STAGES.has(raw)) return raw as PipelineStage;
    return PipelineStage.Lead;
  }

  // ── Duplicate detection ────────────────────────────────────────────────────

  /**
   * Returns a map of (email|phone) → existingCustomer._id for all customers
   * in the business whose email or phone matches any value in `needles`.
   */
  private async detectDuplicates(
    businessId: string,
    needles: { emails: string[]; phones: string[] },
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>(); // key → existing id string
    if (!needles.emails.length && !needles.phones.length) return result;

    const orClauses: Prisma.CustomerWhereInput[] = [];
    if (needles.emails.length)
      orClauses.push({ email: { in: needles.emails.map((e) => e.toLowerCase()) } });
    if (needles.phones.length)
      orClauses.push({ phoneNumber: { in: needles.phones } });

    const existing = await this.prisma.customer.findMany({
      where: { businessId, OR: orClauses },
      select: { id: true, email: true, phoneNumber: true },
    });

    for (const doc of existing) {
      if (doc.email) result.set(doc.email.toLowerCase(), doc.id);
      if (doc.phoneNumber) result.set(doc.phoneNumber, doc.id);
    }
    return result;
  }

  // ── Resolve salesperson ────────────────────────────────────────────────────

  /**
   * Returns the user ID to use as `assignedToId`.
   * - Owner: uses `assignedSalespersonEmail` if provided (must belong to same business);
   *   falls back to the owner's own userId.
   * - Salesperson: always their own id (ignore the column).
   */
  private async resolveAssignedTo(
    user: RequestUser,
    assignedSalespersonEmail?: string,
  ): Promise<string> {
    const selfId = user.userId;

    if (user.role !== 'owner' || !assignedSalespersonEmail) return selfId;

    const found = await this.prisma.user.findFirst({
      where: {
        email: assignedSalespersonEmail.toLowerCase().trim(),
        businessId: user.businessId,
      },
      select: { id: true },
    });

    // Unknown salesperson email → fall back to owner rather than error
    return found ? found.id : selfId;
  }

  // ── PUBLIC: preview ────────────────────────────────────────────────────────

  async preview(
    user: RequestUser,
    file: Express.Multer.File,
  ): Promise<PreviewResult> {
    const rows = await this.parseFile(file.buffer, file.mimetype, file.originalname);

    // Gather needles for duplicate lookup
    const emails: string[] = [];
    const phones: string[] = [];
    for (const row of rows) {
      if (row.email) emails.push(row.email.toLowerCase());
      if (row.phoneNumber) phones.push(row.phoneNumber);
    }

    const dupMap = await this.detectDuplicates(user.businessId, {
      emails,
      phones,
    });

    const results: RowResult[] = [];
    for (const row of rows) {
      const errs = this.validateRow(row);
      if (errs.length) {
        results.push({ rowNumber: row.rowNumber, status: 'error', errors: errs, data: row });
        continue;
      }

      // Duplicate check: email match takes priority, then phone
      const dupId =
        (row.email ? dupMap.get(row.email.toLowerCase()) : undefined) ??
        (row.phoneNumber ? dupMap.get(row.phoneNumber) : undefined);

      if (dupId) {
        results.push({ rowNumber: row.rowNumber, status: 'duplicate', data: row, existingId: dupId });
      } else {
        results.push({ rowNumber: row.rowNumber, status: 'valid', data: row });
      }
    }

    return {
      total: results.length,
      valid: results.filter((r) => r.status === 'valid').length,
      duplicates: results.filter((r) => r.status === 'duplicate').length,
      errors: results.filter((r) => r.status === 'error').length,
      rows: results,
    };
  }

  // ── PUBLIC: commit ─────────────────────────────────────────────────────────

  async commit(
    user: RequestUser,
    file: Express.Multer.File,
    options: CommitOptions,
  ): Promise<CommitResult> {
    const rows = await this.parseFile(file.buffer, file.mimetype, file.originalname);
    const businessId = user.businessId;

    // Re-run duplicate detection (file may differ from preview)
    const emails: string[] = [];
    const phones: string[] = [];
    for (const row of rows) {
      if (row.email) emails.push(row.email.toLowerCase());
      if (row.phoneNumber) phones.push(row.phoneNumber);
    }
    const dupMap = await this.detectDuplicates(businessId, { emails, phones });

    const summary: CommitResult = {
      total: rows.length,
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    for (const row of rows) {
      const errs = this.validateRow(row);
      if (errs.length) {
        summary.failed++;
        summary.errors.push({ rowNumber: row.rowNumber, reason: errs.join('; ') });
        continue;
      }

      const dupId =
        (row.email ? dupMap.get(row.email.toLowerCase()) : undefined) ??
        (row.phoneNumber ? dupMap.get(row.phoneNumber) : undefined);

      try {
        const assignedToId = await this.resolveAssignedTo(user, row.assignedSalespersonEmail);
        const stage = this.coerceStage(row.stage);
        const docData = {
          shopName: row.shopName ?? undefined,
          shopAddress: row.shopAddress ?? undefined,
          email: row.email?.toLowerCase() ?? undefined,
          phoneNumber: row.phoneNumber ?? undefined,
          shopPhoneNumber: row.shopPhoneNumber ?? undefined,
          contactSource: row.contactSource ?? undefined,
          stage,
          status: row.status ?? undefined,
          note: row.note ?? undefined,
          dateOfContact: row.dateOfContact ? new Date(row.dateOfContact) : undefined,
        };

        if (dupId) {
          if (options.duplicateAction === 'update') {
            await this.prisma.customer.update({
              where: { id: dupId },
              data: { customerName: row.customerName!, ...docData },
            });
            summary.updated++;
          } else {
            summary.skipped++;
          }
        } else {
          await this.prisma.customer.create({
            data: {
              businessId,
              assignedToId,
              customerName: row.customerName!,
              ...docData,
            },
          });
          summary.imported++;
        }
      } catch (err) {
        summary.failed++;
        summary.errors.push({
          rowNumber: row.rowNumber,
          reason: (err instanceof Error ? err.message : String(err)),
        });
      }
    }

    return summary;
  }
}
