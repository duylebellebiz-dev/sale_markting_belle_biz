import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmailTemplate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface TemplateContext {
  customer_name?: string;
  invoice_amount?: string;
  service_name?: string;
  expiry_date?: string;
  shop_name?: string;
  salesperson_name?: string;
  [key: string]: string | undefined;
}

@Injectable()
export class EmailTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /** Replace {variable} tokens with values from context. Unknown tokens → empty string. */
  renderTemplate(html: string, context: TemplateContext): string {
    return html.replace(/\{(\w+)\}/g, (_, key: string) =>
      escapeHtml(context[key] ?? ''),
    );
  }

  create(
    businessId: string,
    userId: string,
    dto: CreateEmailTemplateDto,
  ): Promise<EmailTemplate> {
    return this.prisma.emailTemplate.create({
      data: {
        ...dto,
        businessId,
        createdById: userId,
      },
    });
  }

  findAll(businessId: string): Promise<EmailTemplate[]> {
    return this.prisma.emailTemplate.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(businessId: string, id: string): Promise<EmailTemplate> {
    const doc = await this.prisma.emailTemplate.findFirst({
      where: { id, businessId },
    });
    if (!doc) throw new NotFoundException('Email template not found');
    return doc;
  }

  async update(
    businessId: string,
    id: string,
    dto: UpdateEmailTemplateDto,
  ): Promise<EmailTemplate> {
    const result = await this.prisma.emailTemplate.updateMany({
      where: { id, businessId },
      data: { ...dto },
    });
    if (!result.count) throw new NotFoundException('Email template not found');
    return this.findOne(businessId, id);
  }

  async remove(businessId: string, id: string): Promise<void> {
    const result = await this.prisma.emailTemplate.deleteMany({
      where: { id, businessId },
    });
    if (!result.count) throw new NotFoundException('Email template not found');
  }
}
