import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { parse as csvParse } from 'csv-parse/sync';
import { PrismaService } from '../prisma/prisma.service';
import { PipelineStage } from '../customers/pipeline-stage.enum';
import type { RequestUser } from '../common/decorators/current-user.decorator';

// ─── Shared result types (mirrors customer import shape) ─────────────────────

export interface InvoiceRowResult {
  rowNumber: number;
  status: 'valid' | 'duplicate' | 'error' | 'warning';
  errors?: string[];
  warnings?: string[];
  data?: ParsedInvoiceRow;
  existingId?: string;
  resolvedCustomerId?: string;
  resolvedCustomerName?: string;
}

export interface InvoicePreviewResult {
  total: number;
  valid: number;
  duplicates: number;
  errors: number;
  warnings: number;
  rows: InvoiceRowResult[];
}

export interface InvoiceCommitOptions {
  duplicateAction: 'skip' | 'update';
  unknownClientAction: 'create' | 'skip';
}

export interface InvoiceCommitResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  customersCreated: number;
  errors: { rowNumber: number; reason: string }[];
}

// ─── Parsed row (raw values from the file) ───────────────────────────────────

interface ParsedInvoiceRow {
  rowNumber: number;
  invoiceNumber?: string;
  clientName?: string;
  amount?: string;        // raw text, will be money-parsed
  payAmount?: string;     // raw text
  notes?: string;
  status?: string;
  issueDate?: string;     // raw text, will be date-parsed
  dueDate?: string;
  paymentDate?: string;
  services?: string;
}

// ─── Validated/typed row (after parsing succeeds) ────────────────────────────

interface ValidatedInvoice {
  rowNumber: number;
  invoiceNumber: string;
  clientName: string;
  total: number;
  amountPaid: number;
  balanceDue: number;
  notes: string;
  status: InvoiceStatus;
  invoiceDate?: Date;
  dueDate?: Date;
  paymentDate?: Date;
  services: string;
  warnings: string[];
}

// ─── Vietnamese month names ───────────────────────────────────────────────────

const VIET_MONTHS: Record<string, number> = {
  'tháng 1': 1,  'tháng 2': 2,  'tháng 3': 3,  'tháng 4': 4,
  'tháng 5': 5,  'tháng 6': 6,  'tháng 7': 7,  'tháng 8': 8,
  'tháng 9': 9,  'tháng 10': 10, 'tháng 11': 11, 'tháng 12': 12,
};

const EN_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// ─── Date parser ─────────────────────────────────────────────────────────────

/**
 * Returns a UTC midnight Date or null if unparseable.
 * Supports:
 *   - ISO: 2026-06-15, 2026/06/15
 *   - DD/MM/YYYY, DD-MM-YYYY
 *   - MM/DD/YYYY (US — only when day > 12 disambiguates, else treated as DD/MM)
 *   - "24 tháng 6, 2026" / "tháng 6 24, 2026" (Vietnamese)
 *   - "June 15, 2026" / "15 June 2026" (English)
 *   - Excel serial number (number > 1000)
 */
function parseDate(raw: string | number | null | undefined): Date | null {
  if (raw === null || raw === undefined) return null;

  // Excel serial date
  if (typeof raw === 'number' && raw > 1000) {
    // ExcelJS already converts these to JS Date for date-formatted cells
    return null; // handled by cellValue() returning Date directly
  }

  const s = String(raw).trim();
  if (!s) return null;

  // Already a JS Date-string: ISO 8601
  const iso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return utc(+y, +m, +d);
  }

  // Vietnamese: "24 tháng 6, 2026" or "tháng 6 24, 2026"
  for (const [key, month] of Object.entries(VIET_MONTHS)) {
    const re1 = new RegExp(`(\\d{1,2})\\s*${key}[,\\s]+(\\d{4})`, 'i');
    const re2 = new RegExp(`${key}\\s+(\\d{1,2})[,\\s]+(\\d{4})`, 'i');
    let m1 = s.match(re1);
    if (m1) return utc(+m1[2], month, +m1[1]);
    let m2 = s.match(re2);
    if (m2) return utc(+m2[2], month, +m2[1]);
  }

  // English: "June 15, 2026" / "15 June 2026"
  const enMonthName = `(${Object.keys(EN_MONTHS).join('|')})`;
  const enRe1 = new RegExp(`^${enMonthName}\\s+(\\d{1,2})[,\\s]+(\\d{4})$`, 'i');
  const enRe2 = new RegExp(`^(\\d{1,2})\\s+${enMonthName}[,\\s]+(\\d{4})$`, 'i');
  let em = s.match(enRe1);
  if (em) return utc(+em[3], EN_MONTHS[em[1].toLowerCase()], +em[2]);
  em = s.match(enRe2);
  if (em) return utc(+em[3], EN_MONTHS[em[2].toLowerCase()], +em[1]);

  // DD/MM/YYYY or MM/DD/YYYY (slash or dash or dot)
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const [, a, b, y] = dmy.map(Number);
    // If first part > 12, must be day
    if (a > 12) return utc(y, b, a);
    // Otherwise assume DD/MM (common in Vietnam and most of world outside US)
    return utc(y, b, a);
  }

  return null;
}

function utc(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  return isNaN(d.getTime()) ? null : d;
}

// ─── Money parser ─────────────────────────────────────────────────────────────

/**
 * Returns a number or null.
 * Handles:
 *   "1.247,40 US$"  → 1247.40  (European: dot=thousands, comma=decimal)
 *   "1,247.40"      → 1247.40  (US: comma=thousands, dot=decimal)
 *   "$1,247.40"     → 1247.40
 *   "1247,40"       → 1247.40  (European no-thousands)
 *   "1247.40"       → 1247.40
 *   "1 247,40"      → 1247.40  (space thousands separator)
 */
function parseMoney(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return isNaN(raw) ? null : raw;

  // Strip currency symbols, letters, whitespace-as-thousand-sep
  let s = String(raw)
    .replace(/[a-zA-Z$€£¥₫]/g, '')  // strip currency letters/symbols
    .trim();

  if (!s) return null;

  // Detect format by last separator
  const lastComma = s.lastIndexOf(',');
  const lastDot   = s.lastIndexOf('.');

  if (lastComma > lastDot) {
    // European: 1.247,40 — comma is decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // US: 1,247.40 — dot is decimal
    s = s.replace(/,/g, '');
  } else {
    // No separator or only one type — strip non-digit except last separator
    s = s.replace(/[\s,]/g, '');
  }

  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}

// ─── Status mapper ────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, InvoiceStatus> = {
  paid:      InvoiceStatus.Paid,
  'đã thanh toán': InvoiceStatus.Paid,
  'thanh toán': InvoiceStatus.Paid,
  sent:      InvoiceStatus.Sent,
  'đã gửi':  InvoiceStatus.Sent,
  draft:     InvoiceStatus.Draft,
  'nháp':    InvoiceStatus.Draft,
  overdue:   InvoiceStatus.Overdue,
  'quá hạn': InvoiceStatus.Overdue,
  cancelled: InvoiceStatus.Cancelled,
  canceled:  InvoiceStatus.Cancelled,
  'đã hủy':  InvoiceStatus.Cancelled,
};

function parseStatus(raw?: string): InvoiceStatus {
  if (!raw) return InvoiceStatus.Draft;
  return STATUS_MAP[raw.trim().toLowerCase()] ?? InvoiceStatus.Draft;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ImportInvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Template ───────────────────────────────────────────────────────────────

  async generateTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Invoices Import');

    sheet.columns = [
      { header: 'invoiceNumber *', key: 'invoiceNumber', width: 18 },
      { header: 'clientName *',    key: 'clientName',    width: 26 },
      { header: 'amount *',        key: 'amount',        width: 14 },
      { header: 'payAmount',       key: 'payAmount',     width: 14 },
      { header: 'notes',           key: 'notes',         width: 36 },
      { header: 'status',          key: 'status',        width: 14 },
      { header: 'issueDate',       key: 'issueDate',     width: 18 },
      { header: 'dueDate',         key: 'dueDate',       width: 18 },
      { header: 'paymentDate',     key: 'paymentDate',   width: 18 },
      { header: 'services',        key: 'services',      width: 32 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.height = 20;
    headerRow.commit();

    sheet.addRow({
      invoiceNumber: 'INV-001',
      clientName:    'Jane Smith',
      amount:        '1,247.40',
      payAmount:     '1,247.40',
      notes:         'Thank you for your business',
      status:        'Paid',
      issueDate:     '2025-01-15',
      dueDate:       '2025-02-15',
      paymentDate:   '2025-01-20',
      services:      'App Services - Annual Growth',
    });

    const notesRow = sheet.addRow({
      invoiceNumber: '* Required.',
      clientName:    '* Must match an existing customer name.',
      amount:        '* Supports $1,247.40 or 1.247,40 formats',
      status:        'Paid / Sent / Draft / Overdue / Cancelled',
      issueDate:     'YYYY-MM-DD or DD/MM/YYYY or "24 tháng 6, 2026"',
    });
    notesRow.font = { italic: true, color: { argb: 'FF6B7280' } };
    notesRow.commit();

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  // ── File parsing ───────────────────────────────────────────────────────────

  private async parseFile(file: Express.Multer.File): Promise<ParsedInvoiceRow[]> {
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (ext === 'csv' || file.mimetype === 'text/csv' || file.mimetype === 'application/csv') {
      return this.parseCsv(file.buffer);
    }
    if (ext === 'xlsx' || file.mimetype.includes('spreadsheetml')) {
      return this.parseXlsx(file.buffer);
    }
    throw new Error('Unsupported file type. Upload .xlsx or .csv.');
  }

  private parseCsv(buffer: Buffer): ParsedInvoiceRow[] {
    const records = csvParse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
    return records.map((r, i) => this.normalise(r, i + 2));
  }

  private async parseXlsx(buffer: Buffer): Promise<ParsedInvoiceRow[]> {
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (wb.xlsx.load as (b: any) => Promise<ExcelJS.Workbook>)(buffer);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new Error('Excel file has no worksheets.');

    const colMap = new Map<number, string>();
    sheet.getRow(1).eachCell((cell, idx) => {
      const key = String(cell.value ?? '').trim().replace(/\s*\*$/, '').trim();
      colMap.set(idx, key);
    });

    const rows: ParsedInvoiceRow[] = [];
    sheet.eachRow((row, rowIdx) => {
      if (rowIdx === 1) return;
      const rec: Record<string, string> = {};
      row.eachCell({ includeEmpty: true }, (cell, colIdx) => {
        const key = colMap.get(colIdx);
        if (key) rec[key] = this.cellText(cell);
      });
      if (Object.values(rec).every((v) => !v)) return;
      rows.push(this.normalise(rec, rowIdx));
    });
    return rows;
  }

  private cellText(cell: ExcelJS.Cell): string {
    const v = cell.value;
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object' && 'result' in (v as object))
      return String((v as { result: unknown }).result ?? '').trim();
    return String(v).trim();
  }

  private normalise(rec: Record<string, string>, rowNumber: number): ParsedInvoiceRow {
    const g = (k: string) => (rec[k] ?? '').trim();
    return {
      rowNumber,
      invoiceNumber: g('invoiceNumber') || undefined,
      clientName:    g('clientName') || undefined,
      amount:        g('amount') || undefined,
      payAmount:     g('payAmount') || undefined,
      notes:         g('notes') || undefined,
      status:        g('status') || undefined,
      issueDate:     g('issueDate') || undefined,
      dueDate:       g('dueDate') || undefined,
      paymentDate:   g('paymentDate') || undefined,
      services:      g('services') || undefined,
    };
  }

  // ── Validation + type-coercion ─────────────────────────────────────────────

  private validateRow(row: ParsedInvoiceRow): {
    result: ValidatedInvoice | null;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!row.invoiceNumber) errors.push('invoiceNumber is required');
    if (!row.clientName)    errors.push('clientName is required');
    if (!row.amount)        errors.push('amount is required');

    if (errors.length) return { result: null, errors, warnings };

    // Parse money
    const total = parseMoney(row.amount);
    if (total === null) {
      errors.push(`amount "${row.amount}" could not be parsed as a number`);
      return { result: null, errors, warnings };
    }
    if (total < 0) errors.push('amount must be ≥ 0');

    let amountPaid = 0;
    if (row.payAmount) {
      const pa = parseMoney(row.payAmount);
      if (pa === null) {
        errors.push(`payAmount "${row.payAmount}" could not be parsed as a number`);
        return { result: null, errors, warnings };
      }
      amountPaid = pa;
    }

    if (errors.length) return { result: null, errors, warnings };

    // Parse status
    const status = parseStatus(row.status);

    // If Paid but payAmount was blank → amountPaid = total
    if (status === InvoiceStatus.Paid && !row.payAmount) {
      amountPaid = total;
      warnings.push('payAmount was blank for a Paid invoice — set to full amount');
    }

    // Parse dates
    const invoiceDate = row.issueDate ? parseDate(row.issueDate) : undefined;
    if (row.issueDate && !invoiceDate)
      warnings.push(`issueDate "${row.issueDate}" could not be parsed — stored as blank`);

    const dueDateParsed = row.dueDate ? parseDate(row.dueDate) : undefined;
    if (row.dueDate && !dueDateParsed)
      warnings.push(`dueDate "${row.dueDate}" could not be parsed — stored as blank`);

    const paymentDate = row.paymentDate ? parseDate(row.paymentDate) : undefined;
    if (row.paymentDate && !paymentDate)
      warnings.push(`paymentDate "${row.paymentDate}" could not be parsed — stored as blank`);

    const balanceDue = Math.round((total - amountPaid) * 100) / 100;

    return {
      errors: [],
      warnings,
      result: {
        rowNumber:    row.rowNumber,
        invoiceNumber: row.invoiceNumber!.trim(),
        clientName:   row.clientName!.trim(),
        total,
        amountPaid,
        balanceDue,
        notes:        row.notes?.trim() ?? '',
        status,
        invoiceDate:  invoiceDate ?? undefined,
        dueDate:      dueDateParsed ?? undefined,
        paymentDate:  paymentDate ?? undefined,
        services:     row.services?.trim() ?? '',
        warnings,
      },
    };
  }

  // ── Customer lookup ────────────────────────────────────────────────────────

  /**
   * Returns the customer _id string if a case-insensitive match exists
   * in the business on customerName or shopName.
   */
  private async findCustomer(
    businessId: string,
    clientName: string,
  ): Promise<{ id: string; name: string } | null> {
    const doc = await this.prisma.customer.findFirst({
      where: {
        businessId,
        OR: [
          { customerName: { equals: clientName, mode: 'insensitive' } },
          { shopName: { equals: clientName, mode: 'insensitive' } },
        ],
      },
      select: { id: true, customerName: true },
    });
    if (!doc) return null;
    return { id: doc.id, name: doc.customerName };
  }

  // ── PUBLIC: preview ────────────────────────────────────────────────────────

  async preview(
    user: RequestUser,
    file: Express.Multer.File,
  ): Promise<InvoicePreviewResult> {
    const rawRows = await this.parseFile(file);
    const businessId = user.businessId;

    // Collect all valid invoice numbers for dup check in one query
    const validNumbers: string[] = [];
    const staged: Array<{ raw: ParsedInvoiceRow; validated: ValidatedInvoice | null; errors: string[]; warnings: string[] }> = [];

    for (const raw of rawRows) {
      const { result, errors, warnings } = this.validateRow(raw);
      staged.push({ raw, validated: result, errors, warnings });
      if (result) validNumbers.push(result.invoiceNumber);
    }

    // Duplicate detection: one query for all invoice numbers
    const existingMap = new Map<string, string>(); // invoiceNumber → _id
    if (validNumbers.length) {
      const existing = await this.prisma.invoice.findMany({
        where: { businessId, invoiceNumber: { in: validNumbers } },
        select: { id: true, invoiceNumber: true },
      });
      for (const e of existing) {
        existingMap.set(e.invoiceNumber, e.id);
      }
    }

    // Customer resolution (preview only — report unknowns as warnings)
    const customerCache = new Map<string, { id: string; name: string } | null>();

    const rows: InvoiceRowResult[] = [];
    for (const { raw, validated, errors, warnings } of staged) {
      if (!validated) {
        rows.push({ rowNumber: raw.rowNumber, status: 'error', errors, data: raw });
        continue;
      }

      // Customer lookup (cache to avoid N+1)
      const key = validated.clientName.toLowerCase();
      if (!customerCache.has(key)) {
        customerCache.set(key, await this.findCustomer(businessId, validated.clientName));
      }
      const customer = customerCache.get(key)!;

      const allWarnings = [...warnings];
      if (!customer) {
        allWarnings.push(
          `Customer "${validated.clientName}" not found — will be created on commit (or row skipped based on your choice)`,
        );
      }

      const existingId = existingMap.get(validated.invoiceNumber);
      rows.push({
        rowNumber:            raw.rowNumber,
        status:               existingId ? 'duplicate' : (allWarnings.length ? 'warning' : 'valid'),
        warnings:             allWarnings.length ? allWarnings : undefined,
        data:                 raw,
        existingId,
        resolvedCustomerId:   customer?.id,
        resolvedCustomerName: customer?.name ?? undefined,
      });
    }

    return {
      total:      rows.length,
      valid:      rows.filter((r) => r.status === 'valid' || r.status === 'warning').length,
      duplicates: rows.filter((r) => r.status === 'duplicate').length,
      errors:     rows.filter((r) => r.status === 'error').length,
      warnings:   rows.filter((r) => r.status === 'warning').length,
      rows,
    };
  }

  // ── PUBLIC: commit ─────────────────────────────────────────────────────────

  async commit(
    user: RequestUser,
    file: Express.Multer.File,
    options: InvoiceCommitOptions,
  ): Promise<InvoiceCommitResult> {
    const rawRows = await this.parseFile(file);
    const businessId = user.businessId;
    const assignedToId = user.userId;

    // Existing invoice numbers for dup detection
    const allNumbers = rawRows
      .map((r) => r.invoiceNumber?.trim())
      .filter(Boolean) as string[];

    const existingMap = new Map<string, string>();
    if (allNumbers.length) {
      const existing = await this.prisma.invoice.findMany({
        where: { businessId, invoiceNumber: { in: allNumbers } },
        select: { id: true, invoiceNumber: true },
      });
      for (const e of existing) {
        existingMap.set(e.invoiceNumber, e.id);
      }
    }

    const customerCache = new Map<string, string | null>();

    const summary: InvoiceCommitResult = {
      total: rawRows.length,
      imported: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      customersCreated: 0,
      errors: [],
    };

    for (const raw of rawRows) {
      const { result: validated, errors } = this.validateRow(raw);
      if (!validated) {
        summary.failed++;
        summary.errors.push({ rowNumber: raw.rowNumber, reason: errors.join('; ') });
        continue;
      }

      try {
        // Resolve customer
        const cKey = validated.clientName.toLowerCase();
        if (!customerCache.has(cKey)) {
          const found = await this.findCustomer(businessId, validated.clientName);
          customerCache.set(cKey, found ? found.id : null);
        }
        let customerId = customerCache.get(cKey)!;

        if (!customerId) {
          if (options.unknownClientAction === 'create') {
            const created = await this.prisma.customer.create({
              data: {
                businessId,
                assignedToId,
                customerName: validated.clientName,
                stage: PipelineStage.ClosedWon,
                isClosed: true,
              },
            });
            customerId = created.id;
            customerCache.set(cKey, customerId);
            summary.customersCreated++;
          } else {
            summary.skipped++;
            summary.errors.push({
              rowNumber: validated.rowNumber,
              reason: `Customer "${validated.clientName}" not found — row skipped`,
            });
            continue;
          }
        }

        // Build the description for the single summary line item
        const description = validated.services || `Imported Invoice ${validated.invoiceNumber}`;
        const lineItemData = {
          description,
          serviceTerm: '',
          quantity: 1,
          rate: validated.total,
          amount: validated.total,
        };

        const paymentData =
          validated.amountPaid > 0
            ? [
                {
                  date: validated.paymentDate ?? validated.invoiceDate ?? new Date(),
                  amount: validated.amountPaid,
                  note: 'Imported payment record',
                },
              ]
            : [];

        const billTo = {
          name: validated.clientName,
          addressLine: '',
          email: '',
          phone: '',
        };

        const scalarData = {
          invoiceDate:     validated.invoiceDate ?? new Date(),
          dueDate:         validated.dueDate ?? null,
          billTo:          billTo as unknown as Prisma.InputJsonValue,
          subTotal:        validated.total,
          discount:        0,
          shippingCharges: 0,
          adjustment:      0,
          taxRate:         0,
          taxAmount:       0,
          total:           validated.total,
          amountPaid:      validated.amountPaid,
          balanceDue:      validated.balanceDue,
          customerNote:    validated.notes,
          status:          validated.status,
        };

        const existingId = existingMap.get(validated.invoiceNumber);
        if (existingId) {
          if (options.duplicateAction === 'update') {
            // Replace child rows, then update the parent.
            await this.prisma.invoiceLineItem.deleteMany({
              where: { invoiceId: existingId },
            });
            await this.prisma.payment.deleteMany({
              where: { invoiceId: existingId },
            });
            await this.prisma.invoice.update({
              where: { id: existingId },
              data: {
                customerId,
                ...scalarData,
                lineItems: { create: [lineItemData] },
                payments: { create: paymentData },
              },
            });
            summary.updated++;
          } else {
            summary.skipped++;
          }
        } else {
          await this.prisma.invoice.create({
            data: {
              businessId,
              customerId,
              invoiceNumber: validated.invoiceNumber,
              ...scalarData,
              lineItems: { create: [lineItemData] },
              payments: { create: paymentData },
            },
          });
          summary.imported++;
        }
      } catch (err) {
        summary.failed++;
        summary.errors.push({
          rowNumber: validated.rowNumber,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return summary;
  }
}
