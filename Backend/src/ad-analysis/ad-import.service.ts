/**
 * CSV / Excel fallback importer for ad campaign data.
 *
 * Supports two export formats:
 *   - Facebook Ads Manager: export from Ads Manager → Reports → "By Campaign" with Day breakdown
 *   - Google Ads: export from Google Ads → Reports → Campaign → download CSV
 *
 * The parser does fuzzy (case-insensitive, punctuation-stripped) column matching
 * so it tolerates minor header variations between export versions.
 *
 * Flow: preview (validate + return rows) → commit (write to DB).
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { parse as csvParse } from 'csv-parse/sync';
import { PrismaService } from '../prisma/prisma.service';
import { AdProvider } from '@prisma/client';

export type AdImportProvider = 'facebook' | 'google';

interface ParsedCampaignRow {
  rowNumber: number;
  campaignName: string;
  date: Date | null;        // null = no date column found → stored as today
  impressions: bigint;
  clicks: bigint;
  ctr: number | null;
  spend: string | null;
  conversions: number | null;
  cpc: string | null;
  reach: bigint | null;
  status: string;
  objective: string;
  startDate: Date | null;
  endDate: Date | null;
  errors: string[];
}

export interface ImportPreviewRow {
  rowNumber: number;
  campaignName: string;
  date: string | null;
  impressions: string;
  clicks: string;
  spend: string | null;
  errors: string[];
  valid: boolean;
}

export interface ImportSummary {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

// ── Column aliases (normalised key → possible CSV header substrings) ──────────

const COLUMN_ALIASES: Record<string, string[]> = {
  campaignName:  ['campaign name', 'campaign', 'ad set name'],
  date:          ['day', 'date', 'report date', 'segment date'],
  impressions:   ['impressions'],
  clicks:        ['clicks (all)', 'clicks', 'link clicks'],
  ctr:           ['ctr (all)', 'ctr', 'click-through rate'],
  spend:         ['amount spent', 'cost', 'spend', 'total cost'],
  conversions:   ['results', 'conversions', 'purchase', 'leads'],
  cpc:           ['cpc (all)', 'cpc', 'avg. cpc', 'average cpc'],
  reach:         ['reach'],
  status:        ['delivery', 'status', 'campaign state', 'campaign status'],
  objective:     ['objective', 'campaign type', 'advertising channel type'],
  startDate:     ['start date', 'start time'],
  endDate:       ['end date', 'end time', 'stop time'],
};

@Injectable()
export class AdImportService {
  private readonly logger = new Logger(AdImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Templates ────────────────────────────────────────────────────────────────

  async buildTemplate(provider: AdImportProvider, res: import('express').Response) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ad Campaigns');

    const fbHeaders = [
      'Campaign name', 'Day', 'Impressions', 'Reach', 'Clicks (all)', 'CTR (all) (%)',
      'Amount spent (USD)', 'CPC (all) (USD)', 'Results', 'Objective', 'Delivery',
      'Start date', 'End date',
    ];
    const googleHeaders = [
      'Campaign', 'Day', 'Impressions', 'Clicks', 'CTR', 'Avg. CPC',
      'Cost', 'Conversions', 'Cost / conv.', 'Campaign type', 'Campaign state',
      'Start date', 'End date',
    ];

    const headers = provider === 'facebook' ? fbHeaders : googleHeaders;
    ws.addRow(headers).font = { bold: true };

    // Example row so the user understands the format
    if (provider === 'facebook') {
      ws.addRow([
        'Summer Campaign', '2025-06-01', '12000', '9500', '360', '3.00',
        '150.00', '0.42', '12', 'LINK_CLICKS', 'active', '2025-06-01', '2025-06-30',
      ]);
    } else {
      ws.addRow([
        'Brand Campaign', '2025-06-01', '8000', '240', '3.00%', '$0.55',
        '$132.00', '8', '$16.50', 'Search', 'enabled', '2025-06-01', '2025-06-30',
      ]);
    }

    ws.columns.forEach((c) => { if (c.width === undefined || c.width < 18) c.width = 20; });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${provider}-ads-template.xlsx"`);
    await wb.xlsx.write(res);
  }

  // ── Preview ───────────────────────────────────────────────────────────────────

  async preview(
    buffer: Buffer,
    mimetype: string,
    provider: AdImportProvider,
  ): Promise<{ rows: ImportPreviewRow[]; warnings: string[] }> {
    const parsed = await this.parseFile(buffer, mimetype);
    const mapped = this.mapRows(parsed, provider);
    const warnings: string[] = [];

    if (!mapped.length) warnings.push('No data rows found in the file.');

    const rows: ImportPreviewRow[] = mapped.map((r) => ({
      rowNumber: r.rowNumber,
      campaignName: r.campaignName,
      date: r.date ? r.date.toISOString().slice(0, 10) : null,
      impressions: String(r.impressions),
      clicks: String(r.clicks),
      spend: r.spend,
      errors: r.errors,
      valid: r.errors.length === 0,
    }));

    return { rows, warnings };
  }

  // ── Commit ────────────────────────────────────────────────────────────────────

  async commit(
    buffer: Buffer,
    mimetype: string,
    provider: AdImportProvider,
    adAccountId: string,
    businessId: string,
  ): Promise<ImportSummary> {
    // Verify the ad account belongs to this business
    const adAccount = await this.prisma.adAccount.findFirst({
      where: { id: adAccountId, businessId, provider: provider as AdProvider },
    });
    if (!adAccount) {
      throw new BadRequestException(
        `No connected ${provider} ad account found. Please connect one first in AI Settings → Ad Accounts.`,
      );
    }

    const parsed = await this.parseFile(buffer, mimetype);
    const rows = this.mapRows(parsed, provider);

    const summary: ImportSummary = { total: rows.length, imported: 0, skipped: 0, failed: 0, errors: [] };
    const today = new Date();

    for (const row of rows) {
      if (row.errors.length) {
        summary.failed++;
        summary.errors.push({ row: row.rowNumber, reason: row.errors.join('; ') });
        continue;
      }

      try {
        // Upsert the campaign
        const campaign = await this.prisma.campaign.upsert({
          where: {
            adAccountId_externalCampaignId: {
              adAccountId,
              externalCampaignId: `import:${slugify(row.campaignName)}`,
            },
          },
          create: {
            businessId,
            adAccountId,
            provider: provider as AdProvider,
            externalCampaignId: `import:${slugify(row.campaignName)}`,
            name: row.campaignName,
            objective: row.objective,
            status: row.status,
            startDate: row.startDate,
            endDate: row.endDate,
            raw: {} as Prisma.InputJsonValue,
          },
          update: {
            name: row.campaignName,
            objective: row.objective,
            status: row.status,
          },
        });

        // Upsert the metric for this date
        const metricDate = utcMidnight(row.date ?? today);
        await this.prisma.campaignMetric.upsert({
          where: { campaignId_date: { campaignId: campaign.id, date: metricDate } },
          create: {
            campaignId: campaign.id,
            date: metricDate,
            impressions: row.impressions,
            clicks: row.clicks,
            ctr: row.ctr,
            spend: row.spend ?? undefined,
            conversions: row.conversions,
            cpc: row.cpc ?? undefined,
            reach: row.reach,
          },
          update: {
            impressions: row.impressions,
            clicks: row.clicks,
            ctr: row.ctr,
            spend: row.spend ?? undefined,
            conversions: row.conversions,
            cpc: row.cpc ?? undefined,
            reach: row.reach,
          },
        });

        summary.imported++;
      } catch (err) {
        this.logger.error(`Import error row ${row.rowNumber}: ${err}`);
        summary.failed++;
        summary.errors.push({ row: row.rowNumber, reason: `DB error: ${(err as Error).message}` });
      }
    }

    return summary;
  }

  // ── Parsing ───────────────────────────────────────────────────────────────────

  private async parseFile(buffer: Buffer, mimetype: string): Promise<Record<string, string>[]> {
    const isExcel = mimetype.includes('spreadsheet') || mimetype.includes('excel');

    if (isExcel) {
      const wb = new ExcelJS.Workbook();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await wb.xlsx.load(buffer as any);
      const ws = wb.worksheets[0];
      if (!ws) throw new BadRequestException('No worksheet found in the uploaded file.');

      const rows: Record<string, string>[] = [];
      const headerRow = ws.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell((cell) => headers.push(String(cell.value ?? '').trim()));

      ws.eachRow((row, rowIndex) => {
        if (rowIndex === 1) return;
        const record: Record<string, string> = {};
        row.eachCell({ includeEmpty: true }, (cell, colIndex) => {
          const header = headers[colIndex - 1];
          if (header) record[header] = String(cell.value ?? '').trim();
        });
        if (Object.values(record).some((v) => v)) rows.push(record);
      });

      return rows;
    }

    // CSV
    const text = buffer.toString('utf-8').replace(/^﻿/, ''); // strip BOM
    return csvParse(text, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  }

  // ── Column mapping ────────────────────────────────────────────────────────────

  private mapRows(raw: Record<string, string>[], _provider: AdImportProvider): ParsedCampaignRow[] {
    if (!raw.length) return [];

    // Build a header → normalised-key map
    const allHeaders = Object.keys(raw[0]);
    const colMap: Record<string, string> = {};
    for (const header of allHeaders) {
      const norm = normalizeHeader(header);
      for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (aliases.some((alias) => norm.includes(normalizeHeader(alias)))) {
          if (!colMap[key]) colMap[key] = header; // first match wins
        }
      }
    }

    return raw.map((row, idx) => {
      const rowNumber = idx + 2; // 1-based + header row
      const errors: string[] = [];

      const campaignName = col(row, colMap.campaignName)?.trim() ?? '';
      if (!campaignName) errors.push('Campaign name is required');

      const dateStr = col(row, colMap.date);
      let date: Date | null = null;
      if (dateStr) {
        date = parseFlexDate(dateStr);
        if (!date) errors.push(`Unrecognised date format: "${dateStr}"`);
      }

      const impressions = parseBigInt(col(row, colMap.impressions));
      const clicks = parseBigInt(col(row, colMap.clicks));
      const ctr = parsePercent(col(row, colMap.ctr));
      const spend = parseMoney(col(row, colMap.spend));
      const conversions = parseFloatSafe(col(row, colMap.conversions));
      const cpc = parseMoney(col(row, colMap.cpc));
      const reach = parseBigIntNullable(col(row, colMap.reach));
      const status = col(row, colMap.status) ?? '';
      const objective = col(row, colMap.objective) ?? '';
      const startDate = col(row, colMap.startDate) ? parseFlexDate(col(row, colMap.startDate)!) : null;
      const endDate = col(row, colMap.endDate) ? parseFlexDate(col(row, colMap.endDate)!) : null;

      return {
        rowNumber,
        campaignName,
        date,
        impressions,
        clicks,
        ctr,
        spend,
        conversions,
        cpc,
        reach,
        status,
        objective,
        startDate,
        endDate,
        errors,
      };
    });
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function col(row: Record<string, string>, header: string | undefined): string | undefined {
  if (!header) return undefined;
  const v = row[header];
  return v === '' || v === undefined ? undefined : v;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
}

function parseBigInt(v: string | undefined): bigint {
  if (!v) return 0n;
  const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0n : BigInt(n);
}

function parseBigIntNullable(v: string | undefined): bigint | null {
  if (!v) return null;
  const n = parseInt(v.replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? null : BigInt(n);
}

function parseFloatSafe(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function parseMoney(v: string | undefined): string | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n.toFixed(4);
}

function parsePercent(v: string | undefined): number | null {
  if (!v) return null;
  // e.g. "3.00%" → 0.03 ; "3.00" → 0.03
  const n = parseFloat(v.replace(/[^0-9.]/g, ''));
  if (isNaN(n)) return null;
  // If value > 1, assume it's already in percentage points → convert to fraction
  return n > 1 ? n / 100 : n;
}

/** Flexible date parser: YYYY-MM-DD, MM/DD/YYYY, "Jun 1, 2025", etc. */
function parseFlexDate(s: string): Date | null {
  const cleaned = s.trim();
  if (!cleaned) return null;

  // ISO date YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const [y, m, d] = cleaned.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  // MM/DD/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleaned)) {
    const [m, d, y] = cleaned.split('/').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  // Fallback: native Date parse (handles "Jun 1, 2025", "2025/06/01", etc.)
  const ts = Date.parse(cleaned);
  if (!isNaN(ts)) {
    const d = new Date(ts);
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  return null;
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
