import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PipelineStage, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { RescheduleFollowUpDto } from './dto/reschedule-followup.dto';
import { CloseLostDto } from './dto/close-lost.dto';
import type { RequestUser } from '../common/decorators/current-user.decorator';

// Reusable include for user-facing reads: show the assigned salesperson's name/email
const WITH_ASSIGNEE = {
  assignedTo: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.CustomerInclude;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Scoping helper
  //   owner | viewAllCustomers  → businessId only
  //   salesperson (default)     → businessId + assignedToId
  // ---------------------------------------------------------------------------
  private scopeWhere(user: RequestUser): Prisma.CustomerWhereInput {
    const base: Prisma.CustomerWhereInput = { businessId: user.businessId };
    const canViewAll =
      user.role === 'owner' || user.permissions?.viewAllCustomers === true;
    if (!canViewAll) {
      base.assignedToId = user.userId;
    }
    return base;
  }

  async create(user: RequestUser, dto: CreateCustomerDto) {
    const assignedToId =
      user.role === 'owner' && dto.assignedTo ? dto.assignedTo : user.userId;

    return this.prisma.customer.create({
      data: {
        businessId: user.businessId,
        assignedToId,
        customerName: dto.customerName ?? '',
        shopName: dto.shopName ?? '',
        shopAddress: dto.shopAddress ?? '',
        email: dto.email ?? '',
        phoneNumber: dto.phoneNumber ?? '',
        shopPhoneNumber: dto.shopPhoneNumber ?? '',
        contactSource: dto.contactSource ?? '',
        dateOfContact: dto.dateOfContact ? new Date(dto.dateOfContact) : undefined,
        stage: dto.stage,
        status: dto.status ?? '',
        note: dto.note ?? '',
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
      },
      include: WITH_ASSIGNEE,
    });
  }

  async findAll(user: RequestUser) {
    return this.prisma.customer.findMany({
      where: this.scopeWhere(user),
      include: WITH_ASSIGNEE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async search(user: RequestUser, q: string, limit = 20) {
    const trimmed = q.trim();
    const where: Prisma.CustomerWhereInput = { ...this.scopeWhere(user) };

    if (trimmed) {
      where.OR = [
        { customerName: { contains: trimmed, mode: 'insensitive' } },
        { shopName:     { contains: trimmed, mode: 'insensitive' } },
        { email:        { contains: trimmed, mode: 'insensitive' } },
      ];
    }

    return this.prisma.customer.findMany({
      where,
      select: { id: true, customerName: true, shopName: true, email: true, isClosed: true },
      take: limit,
      orderBy: { customerName: 'asc' },
    });
  }

  async findOne(user: RequestUser, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, ...this.scopeWhere(user) },
      include: WITH_ASSIGNEE,
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async update(user: RequestUser, id: string, dto: UpdateCustomerDto) {
    const existing = await this.prisma.customer.findFirst({
      where: { id, ...this.scopeWhere(user) },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Customer not found');

    if (user.role === 'salesperson' && dto.assignedTo) {
      throw new ForbiddenException('Salespeople cannot reassign customers');
    }

    const data: Prisma.CustomerUpdateInput = {};
    if (dto.customerName  !== undefined) data.customerName  = dto.customerName;
    if (dto.shopName      !== undefined) data.shopName      = dto.shopName;
    if (dto.shopAddress   !== undefined) data.shopAddress   = dto.shopAddress;
    if (dto.email         !== undefined) data.email         = dto.email;
    if (dto.phoneNumber   !== undefined) data.phoneNumber   = dto.phoneNumber;
    if (dto.shopPhoneNumber !== undefined) data.shopPhoneNumber = dto.shopPhoneNumber;
    if (dto.contactSource !== undefined) data.contactSource = dto.contactSource;
    if (dto.dateOfContact !== undefined) data.dateOfContact = new Date(dto.dateOfContact);
    if (dto.stage         !== undefined) data.stage         = dto.stage;
    if (dto.status        !== undefined) data.status        = dto.status;
    if (dto.note          !== undefined) data.note          = dto.note;
    if (dto.nextFollowUpAt !== undefined) data.nextFollowUpAt = new Date(dto.nextFollowUpAt);
    if (dto.isClosed      !== undefined) data.isClosed      = dto.isClosed;
    if (dto.assignedTo    !== undefined) data.assignedTo    = { connect: { id: dto.assignedTo } };

    return this.prisma.customer.update({
      where: { id },
      data,
      include: WITH_ASSIGNEE,
    });
  }

  async remove(user: RequestUser, id: string) {
    const existing = await this.prisma.customer.findFirst({
      where: { id, ...this.scopeWhere(user) },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Customer not found');
    await this.prisma.customer.delete({ where: { id } });
    return { message: 'Customer deleted' };
  }

  // ---------------------------------------------------------------------------
  // Follow-up actions (§7.1)
  // ---------------------------------------------------------------------------

  async rescheduleFollowUp(user: RequestUser, id: string, dto: RescheduleFollowUpDto) {
    const existing = await this.prisma.customer.findFirst({
      where: { id, ...this.scopeWhere(user) },
      select: { id: true, isClosed: true },
    });
    if (!existing) throw new NotFoundException('Customer not found');
    if (existing.isClosed) throw new BadRequestException('Customer is already closed');

    return this.prisma.customer.update({
      where: { id },
      data: {
        nextFollowUpAt: new Date(dto.nextFollowUpAt),
        ...(dto.note !== undefined && { note: dto.note }),
      },
      include: WITH_ASSIGNEE,
    });
  }

  async closeLost(user: RequestUser, id: string, dto: CloseLostDto) {
    const existing = await this.prisma.customer.findFirst({
      where: { id, ...this.scopeWhere(user) },
      select: { id: true, isClosed: true },
    });
    if (!existing) throw new NotFoundException('Customer not found');
    if (existing.isClosed) throw new BadRequestException('Customer is already closed');

    return this.prisma.customer.update({
      where: { id },
      data: {
        isClosed: true,
        stage: PipelineStage.ClosedLost,
        nextFollowUpAt: null,
        ...(dto.note !== undefined && { note: dto.note }),
      },
      include: WITH_ASSIGNEE,
    });
  }

  // ---------------------------------------------------------------------------
  // Internal — used by the reminder engine (no auth scoping)
  // ---------------------------------------------------------------------------

  findDueFollowUps() {
    return this.prisma.customer.findMany({
      where: {
        isClosed: false,
        nextFollowUpAt: { not: null, lte: new Date() },
      },
      select: {
        id: true,
        businessId: true,
        assignedToId: true,
        customerName: true,
      },
    });
  }

  clearFollowUpDate(customerId: string) {
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { nextFollowUpAt: null },
    });
  }
}
