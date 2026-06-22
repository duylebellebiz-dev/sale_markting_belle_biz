/**
 * Generates downloadable reports for a single campaign's AI analysis — a PDF
 * (reusing the invoice PDF's black/grey style + business logo) and an Excel
 * workbook (reusing the export module's exceljs setup).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as new (opts?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;

import { PrismaService } from '../prisma/prisma.service';
import { AdOAuthService } from './ad-oauth.service';
import { AdSyncService } from './ad-sync.service';

// ─── Page constants (matches invoice-pdf.service.ts) ───────────────────────────
const PW = 612;
const PH = 792;
const ML = 40;
const MR = 40;
const MT = 40;
const CW = PW - ML - MR;

// ─── Colours (black/grey only) ─────────────────────────────────────────────────
const BLACK = '#000000';
const G900 = '#111827';
const G700 = '#374151';
const G500 = '#6B7280';
const G300 = '#D1D5DB';
const G200 = '#E5E7EB';
const G100 = '#F3F4F6';

function n$(v: number, decimals = 2) {
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function d$(v: number) {
  return `$${n$(v)}`;
}

function fmtDate(d?: string | Date | null): string {
  if (!d) return '—';
  try {
    const dt = new Date(d as string);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  } catch {
    return '—';
  }
}

interface MetricRow {
  date: Date;
  impressions: bigint;
  clicks: bigint;
  ctr: number | null;
  spend: Prisma.Decimal | null;
  conversions: number | null;
  cpc: Prisma.Decimal | null;
  cpa: Prisma.Decimal | null;
  reach: bigint | null;
  roas: number | null;
}

interface CampaignWithData {
  id: string;
  name: string;
  objective: string;
  status: string;
  headline: string;
  creativeText: string;
  startDate: Date | null;
  endDate: Date | null;
  adAccount: { provider: string; accountName: string };
  metrics: MetricRow[];
  analyses: Array<{
    contentReview: string;
    performanceAnalysis: string;
    recommendations: Prisma.JsonValue;
    model: string;
    createdAt: Date;
  }>;
}

interface Totals {
  impressions: bigint;
  clicks: bigint;
  spend: number;
  conversions: number;
  hasConversions: boolean;
  reach: bigint;
  hasReach: boolean;
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
  roas: number | null;
}

@Injectable()
export class AdReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oauthService: AdOAuthService,
    private readonly syncService: AdSyncService,
  ) {}

  private async loadCampaign(
    campaignId: string,
    businessId: string,
    userId: string,
    isOwner: boolean,
  ): Promise<CampaignWithData> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, businessId },
      include: {
        adAccount: { select: { provider: true, accountName: true } },
        metrics: { orderBy: { date: 'asc' } },
        analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const canAccess = await this.oauthService.canAccessAccount(campaign.adAccountId, businessId, userId, isOwner);
    if (!canAccess) throw new NotFoundException('Campaign not found');

    return campaign as unknown as CampaignWithData;
  }

  private async loadBiz(businessId: string) {
    const biz = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { businessName: true, logoUrl: true, addressLine: true, country: true, phone: true, website: true },
    });
    return biz ?? { businessName: '' };
  }

  private totals(metrics: MetricRow[]): Totals {
    let impressions = 0n, clicks = 0n, spend = 0, conversions = 0, reach = 0n;
    let hasConversions = false, hasReach = false;

    for (const m of metrics) {
      impressions += m.impressions;
      clicks += m.clicks;
      spend += m.spend ? Number(m.spend) : 0;
      if (m.conversions != null) {
        conversions += m.conversions;
        hasConversions = true;
      }
      if (m.reach != null) {
        reach += m.reach;
        hasReach = true;
      }
    }

    const ctr = impressions > 0n ? Number(clicks) / Number(impressions) : null;
    const cpc = Number(clicks) > 0 ? spend / Number(clicks) : null;
    const cpa = hasConversions && conversions > 0 ? spend / conversions : null;
    const roasValues = metrics.filter((m) => m.roas != null).map((m) => m.roas as number);
    const roas = roasValues.length ? roasValues.reduce((s, v) => s + v, 0) / roasValues.length : null;

    return { impressions, clicks, spend, conversions, hasConversions, reach, hasReach, ctr, cpc, cpa, roas };
  }

  // ── PDF ───────────────────────────────────────────────────────────────────────

  async streamPdf(campaignId: string, businessId: string, userId: string, isOwner: boolean, res: Response): Promise<void> {
    const campaign = await this.loadCampaign(campaignId, businessId, userId, isOwner);
    const biz = await this.loadBiz(businessId);

    const doc: PDFKit.PDFDocument = new PDFDocument({
      size: 'LETTER', margin: 0, autoFirstPage: true,
      info: { Title: `Campaign Report - ${campaign.name}` },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="campaign-report-${campaign.id}.pdf"`,
    );
    doc.pipe(res);
    this.draw(doc, campaign, biz);
    doc.end();
  }

  private draw(doc: PDFKit.PDFDocument, campaign: CampaignWithData, biz: any): void {
    let y = MT;
    y = this.header(doc, campaign, biz, y);
    y += 20;

    this.hLine(doc, y);
    y += 14;

    y = this.overview(doc, campaign, y);
    y += 16;

    y = this.metricsTable(doc, campaign, y);
    y += 20;

    const latest = campaign.analyses[0] ?? null;
    if (latest) {
      y = this.analysisSections(doc, latest, y);
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(G500)
         .text('No AI analysis has been run for this campaign yet.', ML, y, { width: CW });
    }

    doc.font('Helvetica').fontSize(8).fillColor(G500)
       .text('1', ML, PH - 28, { width: CW, align: 'right' });
  }

  private header(doc: PDFKit.PDFDocument, campaign: CampaignWithData, biz: any, y: number): number {
    const LOGO_MAX_H = 68;
    const LOGO_MAX_W = 100;
    const titleX = 280;
    const titleW = PW - MR - titleX;

    doc.font('Helvetica').fontSize(28).fillColor(G900)
       .text('Campaign Report', titleX, y, { width: titleW, align: 'right' });

    const nameY = y + 36;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(G700)
       .text(campaign.name, titleX, nameY, { width: titleW, align: 'right' });

    let logoBottom = y;
    const logoPath = this.logoPath(biz.logoUrl);
    if (logoPath) {
      try {
        doc.image(logoPath, ML, y, { fit: [LOGO_MAX_W, LOGO_MAX_H] });
        logoBottom = y + LOGO_MAX_H;
      } catch { /* skip broken logo */ }
    }

    let ly = logoBottom + (logoPath ? 8 : 0);
    const bizNameW = titleX - ML - 12;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(G900)
       .text(biz.businessName ?? '', ML, ly, { width: bizNameW });
    ly += doc.heightOfString(biz.businessName ?? '', { width: bizNameW }) + 3;

    if (biz.addressLine) {
      doc.font('Helvetica').fontSize(9).fillColor(G500)
         .text(biz.addressLine, ML, ly, { width: bizNameW });
      ly += doc.heightOfString(biz.addressLine, { width: bizNameW }) + 1;
    }

    return Math.max(ly, nameY + 16);
  }

  private overview(doc: PDFKit.PDFDocument, campaign: CampaignWithData, startY: number): number {
    let y = startY;
    const labW = 110;
    const valX = ML + labW;
    const valW = CW - labW;

    const row = (label: string, value: string) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(G700).text(label, ML, y, { width: labW });
      doc.font('Helvetica').fontSize(9).fillColor(G900).text(value, valX, y, { width: valW });
      y += 15;
    };

    row('Platform:', campaign.adAccount.provider === 'facebook' ? 'Facebook Ads' : 'Google Ads');
    row('Account:', campaign.adAccount.accountName || '—');
    row('Objective:', campaign.objective || '—');
    row('Status:', campaign.status || '—');
    row('Date Range:', `${fmtDate(campaign.startDate)} → ${campaign.endDate ? fmtDate(campaign.endDate) : 'ongoing'}`);
    if (campaign.headline) row('Headline:', campaign.headline);

    return y;
  }

  private metricsTable(doc: PDFKit.PDFDocument, campaign: CampaignWithData, startY: number): number {
    let y = startY;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(G900).text('Key Metrics', ML, y);
    y += 18;

    const t = this.totals(campaign.metrics);
    const cells: [string, string][] = [
      ['Impressions', n$(Number(t.impressions), 0)],
      ['Clicks', n$(Number(t.clicks), 0)],
      ['CTR', t.ctr != null ? `${(t.ctr * 100).toFixed(2)}%` : '—'],
      ['Spend', d$(t.spend)],
      ['Conversions', t.hasConversions ? n$(t.conversions) : '—'],
      ['CPC', t.cpc != null ? d$(t.cpc) : '—'],
      ['CPA', t.cpa != null ? d$(t.cpa) : '—'],
      ['Reach', t.hasReach ? n$(Number(t.reach), 0) : '—'],
      ['ROAS', t.roas != null ? `${t.roas.toFixed(2)}×` : '—'],
    ];

    const colW = CW / 3;
    const rowH = 30;
    cells.forEach(([label, value], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = ML + col * colW;
      const cellY = y + row * rowH;
      doc.rect(x, cellY, colW - 6, rowH - 6).fill(G100);
      doc.font('Helvetica').fontSize(7.5).fillColor(G500)
         .text(label, x + 6, cellY + 5, { width: colW - 18 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(G900)
         .text(value, x + 6, cellY + 15, { width: colW - 18 });
    });

    const rows = Math.ceil(cells.length / 3);
    y += rows * rowH;

    if (campaign.metrics.length === 0) {
      doc.font('Helvetica').fontSize(8).fillColor(G500)
         .text('No metrics synced yet.', ML, y, { width: CW });
      y += 14;
    }

    return y;
  }

  private analysisSections(
    doc: PDFKit.PDFDocument,
    latest: CampaignWithData['analyses'][number],
    startY: number,
  ): number {
    let y = startY;

    if (y + 100 > PH - MT) {
      doc.addPage();
      y = MT;
    }

    this.hLine(doc, y);
    y += 14;

    doc.font('Helvetica-Bold').fontSize(11).fillColor(G900).text('AI Analysis', ML, y);
    doc.font('Helvetica').fontSize(8).fillColor(G500)
       .text(`Model: ${latest.model}  ·  ${fmtDate(latest.createdAt)}`, ML, y, { width: CW, align: 'right' });
    y += 20;

    const section = (title: string, body: string) => {
      if (y + 40 > PH - MT) {
        doc.addPage();
        y = MT;
      }
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(G700).text(title, ML, y, { width: CW });
      y += 14;
      doc.font('Helvetica').fontSize(9).fillColor(G900);
      const text = body || '—';
      doc.text(text, ML, y, { width: CW });
      y += doc.heightOfString(text, { width: CW }) + 16;
    };

    section('Content Review', latest.contentReview);
    section('Performance Analysis', latest.performanceAnalysis);

    const recs = Array.isArray(latest.recommendations)
      ? (latest.recommendations as unknown[]).filter((r): r is string => typeof r === 'string')
      : [];

    if (y + 40 > PH - MT) {
      doc.addPage();
      y = MT;
    }
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(G700).text('Recommendations', ML, y, { width: CW });
    y += 14;
    if (recs.length) {
      for (const r of recs) {
        if (y + 20 > PH - MT) {
          doc.addPage();
          y = MT;
        }
        doc.font('Helvetica').fontSize(9).fillColor(G900).text(`•  ${r}`, ML, y, { width: CW });
        y += doc.heightOfString(`•  ${r}`, { width: CW }) + 6;
      }
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(G500).text('—', ML, y, { width: CW });
      y += 14;
    }

    return y;
  }

  private hLine(doc: PDFKit.PDFDocument, y: number): void {
    doc.moveTo(ML, y).lineTo(PW - MR, y).lineWidth(0.5).strokeColor(G200).stroke();
  }

  private logoPath(logoUrl?: string): string | null {
    if (!logoUrl) return null;
    const rel = logoUrl.startsWith('/') ? logoUrl.slice(1) : logoUrl;
    const full = path.join(process.cwd(), rel);
    return fs.existsSync(full) ? full : null;
  }

  // ── Excel ─────────────────────────────────────────────────────────────────────

  async streamXlsx(campaignId: string, businessId: string, userId: string, isOwner: boolean, res: Response): Promise<void> {
    const campaign = await this.loadCampaign(campaignId, businessId, userId, isOwner);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sales Support App';
    workbook.created = new Date();

    this.buildMetricsSheet(workbook, campaign);
    this.buildAnalysisSheet(workbook, campaign);

    const filename = `campaign-report-${campaign.id}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  }

  // ── One-row-per-campaign report (the "Export" button on the campaigns list) ───

  async streamCampaignsXlsx(
    businessId: string,
    userId: string,
    isOwner: boolean,
    res: Response,
    adAccountId?: string,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<void> {
    const campaigns = await this.syncService.listCampaigns(businessId, userId, isOwner, adAccountId, dateFrom, dateTo);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sales Support App';
    workbook.created = new Date();
    const ws = workbook.addWorksheet('Campaigns');

    ws.columns = [
      { header: 'Ad account', key: 'account', width: 24 },
      { header: 'Platform', key: 'provider', width: 12 },
      { header: 'Campaign', key: 'name', width: 32 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Objective', key: 'objective', width: 18 },
      { header: 'Impressions', key: 'impressions', width: 14 },
      { header: 'Clicks', key: 'clicks', width: 12 },
      { header: 'CTR', key: 'ctr', width: 10 },
      { header: 'Spend', key: 'spend', width: 12 },
      { header: 'Conversions', key: 'conversions', width: 14 },
      { header: 'CPC', key: 'cpc', width: 10 },
      { header: 'ROAS', key: 'roas', width: 10 },
      { header: 'Start date', key: 'startDate', width: 14 },
      { header: 'End date', key: 'endDate', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };

    for (const c of campaigns) {
      let impressions = 0n, clicks = 0n, spend = 0, conversions = 0;
      let roasSum = 0, roasCount = 0;
      for (const m of c.metrics) {
        impressions += m.impressions;
        clicks += m.clicks;
        spend += m.spend ? Number(m.spend) : 0;
        conversions += m.conversions ?? 0;
        if (m.roas != null) { roasSum += m.roas; roasCount++; }
      }
      const ctr = impressions > 0n ? Number(clicks) / Number(impressions) : null;
      const cpc = Number(clicks) > 0 ? spend / Number(clicks) : null;
      const roas = roasCount > 0 ? roasSum / roasCount : null;

      ws.addRow({
        account: c.adAccount.accountName || '(unnamed account)',
        provider: c.adAccount.provider,
        name: c.name,
        status: c.status,
        objective: c.objective,
        impressions: impressions.toString(),
        clicks: clicks.toString(),
        ctr: ctr != null ? `${(ctr * 100).toFixed(2)}%` : '',
        spend: spend.toFixed(2),
        conversions: conversions.toFixed(2),
        cpc: cpc != null ? cpc.toFixed(2) : '',
        roas: roas != null ? roas.toFixed(2) : '',
        startDate: c.startDate ? c.startDate.toISOString().slice(0, 10) : '',
        endDate: c.endDate ? c.endDate.toISOString().slice(0, 10) : '',
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="campaigns-report.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  }

  private buildMetricsSheet(workbook: ExcelJS.Workbook, campaign: CampaignWithData): void {
    const columns: { header: string; key: string; width: number }[] = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Impressions', key: 'impressions', width: 14 },
      { header: 'Clicks', key: 'clicks', width: 12 },
      { header: 'CTR', key: 'ctr', width: 10 },
      { header: 'Spend', key: 'spend', width: 12 },
      { header: 'Conversions', key: 'conversions', width: 14 },
      { header: 'CPC', key: 'cpc', width: 10 },
      { header: 'CPA', key: 'cpa', width: 10 },
      { header: 'Reach', key: 'reach', width: 12 },
      { header: 'ROAS', key: 'roas', width: 10 },
    ];

    const sheet = workbook.addWorksheet('Metrics');
    sheet.columns = columns;

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 20;
    headerRow.commit();

    for (const m of campaign.metrics) {
      sheet.addRow({
        date: m.date,
        impressions: Number(m.impressions),
        clicks: Number(m.clicks),
        ctr: m.ctr ?? '',
        spend: m.spend ? Number(m.spend) : 0,
        conversions: m.conversions ?? '',
        cpc: m.cpc ? Number(m.cpc) : '',
        cpa: m.cpa ? Number(m.cpa) : '',
        reach: m.reach != null ? Number(m.reach) : '',
        roas: m.roas ?? '',
      });
    }

    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getColumn('date').numFmt = 'yyyy-mm-dd';
  }

  private buildAnalysisSheet(workbook: ExcelJS.Workbook, campaign: CampaignWithData): void {
    const sheet = workbook.addWorksheet('Analysis');
    sheet.columns = [
      { header: 'Field', key: 'field', width: 24 },
      { header: 'Value', key: 'value', width: 100 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 20;
    headerRow.commit();

    const latest = campaign.analyses[0] ?? null;
    if (!latest) {
      sheet.addRow({ field: 'Status', value: 'No AI analysis has been run for this campaign yet.' });
      return;
    }

    const recs = Array.isArray(latest.recommendations)
      ? (latest.recommendations as unknown[]).filter((r): r is string => typeof r === 'string')
      : [];

    sheet.addRow({ field: 'Campaign', value: campaign.name });
    sheet.addRow({ field: 'Model', value: latest.model });
    sheet.addRow({ field: 'Created At', value: latest.createdAt });
    sheet.addRow({ field: 'Content Review', value: latest.contentReview || '—' });
    sheet.addRow({ field: 'Performance Analysis', value: latest.performanceAnalysis || '—' });
    sheet.addRow({ field: 'Recommendations', value: recs.length ? recs.map((r) => `• ${r}`).join('\n') : '—' });

    for (let i = 2; i <= sheet.rowCount; i++) {
      sheet.getRow(i).alignment = { wrapText: true, vertical: 'top' };
    }
    sheet.getCell('B3').numFmt = 'yyyy-mm-dd hh:mm';
  }
}
