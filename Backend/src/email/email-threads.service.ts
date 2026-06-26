import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GmailService } from './gmail.service';
import type { RequestUser } from '../common/decorators/current-user.decorator';

export type ThreadItem =
  | {
      kind: 'outbound_log';
      id: string;
      subject: string;
      status: string;
      sentAt: Date | null;
      createdAt: Date;
    }
  | {
      kind: 'message';
      id: string;
      direction: 'outbound' | 'inbound';
      from: string;
      to: string;
      subject: string;
      bodyHtml: string;
      bodyText: string;
      at: Date;
    };

@Injectable()
export class EmailThreadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailService: GmailService,
  ) {}

  private canViewAll(user: RequestUser): boolean {
    return user.role === 'owner' || user.permissions?.viewAllCustomers === true;
  }

  private async resolveCustomer(user: RequestUser, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId: user.businessId,
        ...(this.canViewAll(user) ? {} : { assignedToId: user.userId }),
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  // ---------------------------------------------------------------------------
  // GET /email/threads/:customerId
  // ---------------------------------------------------------------------------
  async getThread(user: RequestUser, customerId: string): Promise<ThreadItem[]> {
    const customer = await this.resolveCustomer(user, customerId);

    const [logs, messages] = await Promise.all([
      this.prisma.emailLog.findMany({
        where: { businessId: user.businessId, customerId: customer.id },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.emailMessage.findMany({
        where: { businessId: user.businessId, customerId: customer.id },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const items: ThreadItem[] = [
      ...logs.map((l): ThreadItem => ({
        kind: 'outbound_log',
        id: l.id,
        subject: l.subject,
        status: l.status,
        sentAt: l.sentAt,
        createdAt: l.createdAt,
      })),
      ...messages.map((m): ThreadItem => ({
        kind: 'message',
        id: m.id,
        direction: m.direction,
        from: m.from,
        to: m.to,
        subject: m.subject,
        bodyHtml: m.bodyHtml,
        bodyText: m.bodyText,
        at: m.direction === 'inbound' ? m.receivedAt ?? m.createdAt : m.sentAt ?? m.createdAt,
      })),
    ];

    items.sort((a, b) => {
      const aTime = a.kind === 'outbound_log' ? (a.sentAt ?? a.createdAt).getTime() : a.at.getTime();
      const bTime = b.kind === 'outbound_log' ? (b.sentAt ?? b.createdAt).getTime() : b.at.getTime();
      return aTime - bTime;
    });

    return items;
  }

  // ---------------------------------------------------------------------------
  // POST /email/threads/:customerId/reply — single recipient, via Gmail (§ Part 5)
  // ---------------------------------------------------------------------------
  async reply(
    user: RequestUser,
    customerId: string,
    dto: { subject: string; bodyHtml: string },
  ) {
    const customer = await this.resolveCustomer(user, customerId);
    if (!customer.email) {
      throw new BadRequestException('This customer has no email address on file.');
    }

    // Maintain Gmail threading by replying to the most recent message in the thread
    const lastMessage = await this.prisma.emailMessage.findFirst({
      where: { businessId: user.businessId, customerId: customer.id },
      orderBy: { createdAt: 'desc' },
    });

    const { gmailMessageId, gmailThreadId } = await this.gmailService.sendReply(user.businessId, {
      to: customer.email,
      subject: dto.subject,
      bodyHtml: dto.bodyHtml,
      threadId: lastMessage?.gmailThreadId,
      inReplyToMessageId: lastMessage?.gmailMessageId,
      references: lastMessage?.gmailMessageId,
    });

    const gmail = await this.prisma.gmailConnection.findUnique({ where: { businessId: user.businessId } });

    return this.prisma.emailMessage.create({
      data: {
        businessId: user.businessId,
        customerId: customer.id,
        direction: 'outbound',
        gmailMessageId,
        gmailThreadId,
        from: gmail?.emailAddress ?? '',
        to: customer.email,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        sentAt: new Date(),
      },
    });
  }

  // ---------------------------------------------------------------------------
  // GET /email/threads/unmatched — owner / viewAllCustomers only
  // ---------------------------------------------------------------------------
  async listUnmatched(user: RequestUser) {
    if (!this.canViewAll(user)) {
      throw new ForbiddenException('You do not have permission to view unmatched replies.');
    }
    return this.prisma.emailMessage.findMany({
      where: { businessId: user.businessId, customerId: null, direction: 'inbound' },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------------
  // PATCH /email/threads/unmatched/:messageId/link
  // ---------------------------------------------------------------------------
  async linkUnmatched(user: RequestUser, messageId: string, customerId: string) {
    if (!this.canViewAll(user)) {
      throw new ForbiddenException('You do not have permission to link unmatched replies.');
    }
    const message = await this.prisma.emailMessage.findFirst({
      where: { id: messageId, businessId: user.businessId, customerId: null },
    });
    if (!message) throw new NotFoundException('Unmatched message not found');

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, businessId: user.businessId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.emailMessage.update({
      where: { id: messageId },
      data: { customerId },
    });
  }
}
