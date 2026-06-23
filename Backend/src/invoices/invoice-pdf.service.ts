import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as new (opts?: PDFKit.PDFDocumentOptions) => PDFKit.PDFDocument;

import { PrismaService } from '../prisma/prisma.service';

// ─── Page constants ────────────────────────────────────────────────────────────
const PW = 612;   // letter width  (pt)
const PH = 792;   // letter height (pt)
const ML = 40;    // left margin
const MR = 40;    // right margin
const MT = 40;    // top margin
const CW = PW - ML - MR; // content width = 532

// ─── Table column layout ───────────────────────────────────────────────────────
// #(24) | Description(268) | Qty(56) | Rate(80) | Amount(104)
const TC = {
  num:  { x: ML,        w: 24  },
  desc: { x: ML + 24,   w: 268 },
  qty:  { x: ML + 292,  w: 56  },
  rate: { x: ML + 348,  w: 80  },
  amt:  { x: ML + 428,  w: 104 },
};

// ─── Colours (black/grey only — §12.3) ────────────────────────────────────────
const BLACK = '#000000';
const G900  = '#111827';
const G700  = '#374151';
const G500  = '#6B7280';
const G400  = '#9CA3AF';
const G300  = '#D1D5DB';
const G200  = '#E5E7EB';
const G100  = '#F3F4F6';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Format a number as 1,234.00 (no dollar sign) */
function n$(v: number) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format a number as $1,234.00 */
function d$(v: number) {
  return `$${n$(v)}`;
}

/** Format a date as YYYY/MM/DD to match sample */
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

/**
 * Convert Prisma invoice (with Decimal money fields) to a plain object with
 * JavaScript numbers so the PDF renderer never touches Decimal instances.
 * Also maps `termsConditions` → `terms_conditions` for the footer.
 */
function addressLines(address?: string | null): string[] {
  if (!address?.trim()) return [];
  return address
    .split(/\r?\n|,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function toPlain(inv: any): any {
  return {
    ...inv,
    subTotal:        Number(inv.subTotal ?? 0),
    discount:        Number(inv.discount ?? 0),
    shippingCharges: Number(inv.shippingCharges ?? 0),
    adjustment:      Number(inv.adjustment ?? 0),
    taxRate:         Number(inv.taxRate ?? 0),
    taxAmount:       Number(inv.taxAmount ?? 0),
    total:           Number(inv.total ?? 0),
    amountPaid:      Number(inv.amountPaid ?? 0),
    balanceDue:      Number(inv.balanceDue ?? 0),
    terms_conditions: inv.termsConditions ?? inv.terms_conditions ?? '',
    lineItems: (inv.lineItems ?? []).map((li: any) => ({
      ...li,
      quantity: Number(li.quantity ?? 0),
      rate:     Number(li.rate ?? 0),
      amount:   Number(li.amount ?? 0),
    })),
  };
}

// ───────────────────────────────────────────────────────────────────────────────

@Injectable()
export class InvoicePdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generateBuffer(invoice: any, businessId: string): Promise<Buffer> {
    const biz = await this.loadBiz(businessId);
    const plain = toPlain(invoice);
    return new Promise<Buffer>((resolve, reject) => {
      const doc: PDFKit.PDFDocument = new PDFDocument({ size: 'LETTER', margin: 0, autoFirstPage: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      this.draw(doc, plain, biz);
      doc.end();
    });
  }

  async streamPdf(invoice: any, businessId: string, res: Response): Promise<void> {
    const biz = await this.loadBiz(businessId);
    const plain = toPlain(invoice);
    const doc: PDFKit.PDFDocument = new PDFDocument({
      size: 'LETTER', margin: 0, autoFirstPage: true,
      info: { Title: `Invoice ${plain.invoiceNumber}` },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${plain.invoiceNumber}.pdf"`);
    doc.pipe(res);
    this.draw(doc, plain, biz);
    doc.end();
  }

  private async loadBiz(businessId: string) {
    const biz = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        businessName: true,
        logoUrl: true,
        addressLine: true,
        country: true,
        phone: true,
        website: true,
        gstNumber: true,
        pstNumber: true,
      },
    });
    return biz ?? { businessName: '' };
  }

  // ─────────────────────────────────────────────────────────────────────────────

  private draw(doc: PDFKit.PDFDocument, inv: any, biz: any): void {
    let y = MT;

    y = this.header(doc, inv, biz, y);
    y += 20;

    y = this.billTo(doc, inv, y);

    // thin line just above table
    this.hLine(doc, y);
    y += 0; // table header starts right at y

    y = this.table(doc, inv, y);

    // ensure enough space for totals + footer
    if (y + 200 > PH - MT) {
      doc.addPage();
      y = MT;
    }

    y += 8;
    y = this.totals(doc, inv, y);
    y += 28;

    this.footer(doc, inv, biz, y);

    // Page number bottom-right
    doc.font('Helvetica').fontSize(8).fillColor(G400)
       .text('1', ML, PH - 28, { width: CW, align: 'right' });
  }

  // ── Header ────────────────────────────────────────────────────────────────────
  private header(doc: PDFKit.PDFDocument, inv: any, biz: any, y: number): number {
    const LOGO_MAX_H = 50;
    const LOGO_MAX_W = 75;

    // ── RIGHT: large "Invoice" heading ────────────────────────────────────────
    const invTitleX = 330;
    const invTitleW = PW - MR - invTitleX; // 242

    doc.font('Helvetica').fontSize(36).fillColor(G900)
       .text('Invoice', invTitleX, y, { width: invTitleW, align: 'right' });

    const invNumY = y + 38;
    if (inv.invoiceNumber) {
      doc.font('Helvetica').fontSize(8.5).fillColor(G500)
         .text(`#${inv.invoiceNumber}`, invTitleX, invNumY, { width: invTitleW, align: 'right' });
    }

    const bdY = invNumY + 16;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(G700)
       .text('Balance Due', invTitleX, bdY, { width: invTitleW, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(14).fillColor(G900)
       .text(d$(inv.balanceDue ?? 0), invTitleX, bdY + 13, { width: invTitleW, align: 'right' });

    const rightBottom = bdY + 13 + 19;

    // ── LEFT: logo alone, then biz name + address below ───────────────────────
    let logoBottom = y;
    const logoPath = this.logoPath(biz.logoUrl);
    if (logoPath) {
      try {
        doc.image(logoPath, ML, y, { fit: [LOGO_MAX_W, LOGO_MAX_H] });
        logoBottom = y + LOGO_MAX_H;
      } catch { /* skip broken logo */ }
    }

    let ly = logoBottom + (logoPath ? 8 : 0);

    const bizNameW = invTitleX - ML - 12;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(G900)
       .text(biz.businessName ?? '', ML, ly, { width: bizNameW });
    doc.font('Helvetica-Bold').fontSize(11);
    ly += doc.heightOfString(biz.businessName ?? '', { width: bizNameW }) + 3;

    if (biz.addressLine) {
      doc.font('Helvetica').fontSize(9).fillColor(G500)
         .text(biz.addressLine, ML, ly, { width: bizNameW });
      doc.font('Helvetica').fontSize(9);
      ly += doc.heightOfString(biz.addressLine, { width: bizNameW }) + 1;
    }

    if (biz.country) {
      doc.font('Helvetica').fontSize(9).fillColor(G500)
         .text(biz.country, ML, ly, { width: bizNameW });
      ly += 12;
    }

    const contact = [biz.phone, biz.website].filter(Boolean).join('  |  ');
    if (contact) {
      doc.font('Helvetica').fontSize(9).fillColor(G500)
         .text(contact, ML, ly, { width: bizNameW });
      ly += 12;
    }

    return Math.max(ly, rightBottom);
  }

  // ── Bill-To ───────────────────────────────────────────────────────────────────
  private billTo(doc: PDFKit.PDFDocument, inv: any, startY: number): number {
    const leftW   = 240;
    const rightX  = 350;
    const rightW  = PW - MR - rightX; // 222
    const y0      = startY;
    const VAL_W   = 80;
    const LAB_W   = 100;
    const valX    = PW - MR - VAL_W;
    const labX    = valX - LAB_W - 6;

    let ly = y0;

    const billTo = inv.billTo as any ?? {};
    const billToAddress = billTo.addressLine || inv.customer?.shopAddress || '';
    const cName = billTo.name || inv.customer?.shopName || inv.customer?.customerName || '-';

    doc.font('Helvetica-Bold').fontSize(11).fillColor(G900)
       .text(cName, ML, ly, { width: leftW });
    doc.font('Helvetica-Bold').fontSize(11);
    ly += doc.heightOfString(cName, { width: leftW }) + 3;

    const parts = addressLines(billToAddress);
    if (parts.length) {
      for (const part of parts) {
        doc.font('Helvetica').fontSize(9).fillColor(G700)
           .text(part, ML, ly, { width: leftW });
        ly += 13;
      }
    }

    if (!parts.length) {
      const contact = [billTo.email, billTo.phone, inv.customer?.email, inv.customer?.phoneNumber]
        .filter(Boolean)
        .join('  |  ');
      if (contact) {
        doc.font('Helvetica').fontSize(9).fillColor(G500)
           .text(contact, ML, ly, { width: leftW });
        ly += 13;
      }
    }

    let ry = y0;

    const metaRow = (label: string, value: string) => {
      doc.font('Helvetica').fontSize(9).fillColor(G500)
         .text(label, labX, ry, { width: LAB_W, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(G900)
         .text(value, valX, ry, { width: VAL_W, align: 'right' });
      ry += 14;
    };

    metaRow('Invoice Date :', fmtDate(inv.invoiceDate));
    if (inv.dueDate)  metaRow('Due Date :', fmtDate(inv.dueDate));
    if (inv.terms)    metaRow('Terms :', inv.terms);

    const sectionBottom = Math.max(ly, ry) + 14;
    this.hLine(doc, sectionBottom);
    return sectionBottom + 1;
  }

  // ── Table ─────────────────────────────────────────────────────────────────────
  private table(doc: PDFKit.PDFDocument, inv: any, startY: number): number {
    const HDR_H      = 22;
    const ROW_PAD    = 7;
    const MIN_ROW_H  = 26;
    const PAGE_BREAK = PH - MT - 200;

    const drawHeader = (y: number) => {
      doc.rect(ML, y, CW, HDR_H).fill(G300);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BLACK);
      doc.text('#',           TC.num.x  + 2,  y + 7, { width: TC.num.w  - 2 });
      doc.text('Description', TC.desc.x + 3,  y + 7, { width: TC.desc.w - 3 });
      doc.text('Qty',         TC.qty.x,        y + 7, { width: TC.qty.w,  align: 'right' });
      doc.text('Rate',        TC.rate.x,       y + 7, { width: TC.rate.w, align: 'right' });
      doc.text('Amount',      TC.amt.x,        y + 7, { width: TC.amt.w - 3, align: 'right' });
    };

    drawHeader(startY);
    let y = startY + HDR_H;

    const items: any[] = inv.lineItems ?? [];

    items.forEach((item: any, idx: number) => {
      doc.font('Helvetica').fontSize(9);
      const descH = doc.heightOfString(item.description ?? '', { width: TC.desc.w - 8 });

      let termH = 0;
      if (item.serviceTerm) {
        const termText = `Service Term: ${item.serviceTerm}`;
        doc.font('Helvetica').fontSize(8);
        termH = doc.heightOfString(termText, { width: TC.desc.w - 8 }) + 3;
      }

      const rowH = Math.max(MIN_ROW_H, descH + termH + ROW_PAD * 2);

      if (y + rowH > PAGE_BREAK) {
        doc.addPage();
        y = MT;
        drawHeader(y);
        y += HDR_H;
      }

      doc.moveTo(ML, y + rowH).lineTo(PW - MR, y + rowH)
         .lineWidth(0.4).strokeColor(G200).stroke();

      const ty = y + ROW_PAD;

      doc.font('Helvetica').fontSize(9).fillColor(G500)
         .text(String(idx + 1), TC.num.x + 2, ty, { width: TC.num.w - 2 });

      doc.font('Helvetica').fontSize(9).fillColor(G900)
         .text(item.description ?? '', TC.desc.x + 3, ty, { width: TC.desc.w - 8, lineBreak: true });

      if (item.serviceTerm) {
        doc.font('Helvetica').fontSize(9);
        const actualDescH = doc.heightOfString(item.description ?? '', { width: TC.desc.w - 8 });
        const termText = `Service Term: ${item.serviceTerm}`;
        doc.font('Helvetica').fontSize(8).fillColor(G500)
           .text(termText, TC.desc.x + 3, ty + actualDescH + 2, { width: TC.desc.w - 8 });
      }

      doc.font('Helvetica').fontSize(9).fillColor(G700)
         .text(n$(item.quantity ?? 0), TC.qty.x, ty, { width: TC.qty.w, align: 'right' });

      doc.font('Helvetica').fontSize(9).fillColor(G700)
         .text(n$(item.rate ?? 0), TC.rate.x, ty, { width: TC.rate.w, align: 'right' });

      doc.font('Helvetica').fontSize(9).fillColor(G900)
         .text(n$(item.amount ?? 0), TC.amt.x, ty, { width: TC.amt.w - 3, align: 'right' });

      y += rowH;
    });

    return y;
  }

  // ── Totals ────────────────────────────────────────────────────────────────────
  private totals(doc: PDFKit.PDFDocument, inv: any, startY: number): number {
    const blockX  = 330;
    const labelW  = 120;
    const valX    = blockX + labelW + 6;
    const valW    = PW - MR - valX;
    let y = startY;

    const row = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
         .fillColor(bold ? G900 : G500)
         .text(label, blockX, y, { width: labelW, align: 'right' });
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
         .fillColor(bold ? G900 : G700)
         .text(value, valX, y, { width: valW, align: 'right' });
      y += 18;
    };

    row('Sub Total', n$(inv.subTotal ?? 0));

    if ((inv.discount ?? 0) > 0) {
      const discAmt = (inv.subTotal ?? 0) * (inv.discount ?? 0) / 100;
      row(`Discount (${inv.discount}%)`, `-${n$(discAmt)}`);
    }
    if ((inv.shippingCharges ?? 0) > 0) {
      row('Shipping', n$(inv.shippingCharges));
    }
    if (inv.adjustment && inv.adjustment !== 0) {
      const sign = inv.adjustment > 0 ? '' : '-';
      row('Adjustment', `${sign}${n$(Math.abs(inv.adjustment))}`);
    }

    if ((inv.taxRate ?? 0) > 0) {
      const taxLabel = inv.taxLabel || 'GST';
      row(`${taxLabel} (${inv.taxRate}%)`, n$(inv.taxAmount ?? 0));
    }

    doc.moveTo(blockX, y - 4).lineTo(PW - MR, y - 4)
       .lineWidth(0.5).strokeColor(G300).stroke();
    y += 2;

    row('Total', d$(inv.total ?? 0), true);
    y += 4;

    const boxH  = 26;
    const boxX  = blockX - 8;
    const boxW  = PW - MR - boxX;

    doc.rect(boxX, y, boxW, boxH).fill(G100);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(G900)
       .text('Balance Due', boxX + 4, y + 8, { width: valX - boxX - 8, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(G900)
       .text(d$(inv.balanceDue ?? 0), valX, y + 7, { width: valW - 2, align: 'right' });

    return y + boxH;
  }

  // ── Footer ────────────────────────────────────────────────────────────────────
  private footer(doc: PDFKit.PDFDocument, inv: any, biz: any, y: number): void {
    if (inv.customerNote) {
      doc.font('Helvetica').fontSize(9).fillColor(G700)
         .text(inv.customerNote, ML, y, { width: CW });
      doc.font('Helvetica').fontSize(9);
      y += doc.heightOfString(inv.customerNote, { width: CW }) + 14;
    }

    const taxLine = [biz.gstNumber, biz.pstNumber].filter(Boolean).join('    ');
    if (taxLine) {
      doc.font('Helvetica').fontSize(9).fillColor(G500)
         .text(taxLine, ML, y, { width: CW });
      doc.font('Helvetica').fontSize(9);
      y += doc.heightOfString(taxLine, { width: CW }) + 8;
    }

    // terms_conditions is remapped from termsConditions by toPlain()
    if (inv.terms_conditions) {
      doc.font('Helvetica').fontSize(8).fillColor(G500)
         .text(inv.terms_conditions, ML, y, { width: CW });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  private hLine(doc: PDFKit.PDFDocument, y: number): void {
    doc.moveTo(ML, y).lineTo(PW - MR, y).lineWidth(0.5).strokeColor(G200).stroke();
  }

  private logoPath(logoUrl?: string): string | null {
    if (!logoUrl) return null;
    const rel  = logoUrl.startsWith('/') ? logoUrl.slice(1) : logoUrl;
    const full = path.join(process.cwd(), rel);
    return fs.existsSync(full) ? full : null;
  }
}
