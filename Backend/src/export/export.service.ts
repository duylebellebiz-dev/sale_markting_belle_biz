import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/decorators/current-user.decorator';

// Every exported field in display order
const COLUMNS: { header: string; key: string; width: number }[] = [
  { header: 'ID',                key: 'id',               width: 26 },
  { header: 'Customer Name',     key: 'customerName',     width: 24 },
  { header: 'Shop Name',         key: 'shopName',         width: 24 },
  { header: 'Email',             key: 'email',            width: 28 },
  { header: 'Phone Number',      key: 'phoneNumber',      width: 18 },
  { header: 'Shop Phone',        key: 'shopPhoneNumber',  width: 18 },
  { header: 'Contact Source',    key: 'contactSource',    width: 18 },
  { header: 'Date of Contact',   key: 'dateOfContact',    width: 18 },
  { header: 'Stage',             key: 'stage',            width: 16 },
  { header: 'Status',            key: 'status',           width: 16 },
  { header: 'Note',              key: 'note',             width: 36 },
  { header: 'Next Follow-up',    key: 'nextFollowUpAt',   width: 18 },
  { header: 'Closed',            key: 'isClosed',         width: 10 },
  { header: 'Assigned To',       key: 'assignedToName',   width: 22 },
  { header: 'Assigned Email',    key: 'assignedToEmail',  width: 28 },
  { header: 'Created At',        key: 'createdAt',        width: 20 },
  { header: 'Updated At',        key: 'updatedAt',        width: 20 },
];

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportCustomers(user: RequestUser, res: Response): Promise<void> {
    // Scope query identically to the customers module
    const where: Prisma.CustomerWhereInput = { businessId: user.businessId };
    if (user.role === 'salesperson') {
      where.assignedToId = user.userId;
    }

    const customers = await this.prisma.customer.findMany({
      where,
      include: { assignedTo: { select: { fullName: true, email: true } } },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sales Support App';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Customers');

    // Header row
    sheet.columns = COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width,
    }));

    // Style the header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' }, // blue-600
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 20;
    headerRow.commit();

    // Data rows
    for (const c of customers) {
      sheet.addRow({
        id:                c.id,
        customerName:      c.customerName ?? '',
        shopName:          c.shopName ?? '',
        email:             c.email ?? '',
        phoneNumber:       c.phoneNumber ?? '',
        shopPhoneNumber:   c.shopPhoneNumber ?? '',
        contactSource:     c.contactSource ?? '',
        dateOfContact:     c.dateOfContact ?? '',
        stage:             c.stage ?? '',
        status:            c.status ?? '',
        note:              c.note ?? '',
        nextFollowUpAt:    c.nextFollowUpAt ?? '',
        isClosed:          c.isClosed ? 'Yes' : 'No',
        assignedToName:    c.assignedTo?.fullName ?? '',
        assignedToEmail:   c.assignedTo?.email ?? '',
        createdAt:         c.createdAt ?? '',
        updatedAt:         c.updatedAt ?? '',
      });
    }

    // Auto-filter on header row
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to:   { row: 1, column: COLUMNS.length },
    };

    // Freeze the header row so it stays visible while scrolling
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Format date columns
    const dateCols = ['dateOfContact', 'nextFollowUpAt', 'createdAt', 'updatedAt'];
    for (const key of dateCols) {
      const col = sheet.getColumn(key);
      col.numFmt = 'yyyy-mm-dd hh:mm';
    }

    const filename = `customers-${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  }
}
