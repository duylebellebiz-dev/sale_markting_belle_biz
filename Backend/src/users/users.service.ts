import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_SALESPERSON_PERMISSIONS, UserPermissions } from './user-permissions';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';

// Reusable Prisma select that never returns passwordHash
const SAFE_SELECT = {
  id: true,
  businessId: true,
  fullName: true,
  email: true,
  role: true,
  permissions: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PERMISSION_SELECT = {
  id: true,
  fullName: true,
  email: true,
  permissions: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(businessId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        businessId,
        fullName: dto.fullName,
        email: dto.email.toLowerCase(),
        passwordHash,
        role: 'salesperson',
        permissions: { ...DEFAULT_SALESPERSON_PERMISSIONS },
      },
      select: SAFE_SELECT,
    });
  }

  async findAll(businessId: string) {
    return this.prisma.user.findMany({
      where: { businessId, role: 'salesperson' },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(businessId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, businessId, role: 'salesperson' },
      select: SAFE_SELECT,
    });
    if (!user) throw new NotFoundException('Staff member not found');
    return user;
  }

  async update(businessId: string, userId: string, dto: UpdateUserDto) {
    // Ensure the user exists and belongs to this business
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, businessId, role: 'salesperson' },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Staff member not found');

    if (dto.email) {
      const conflict = await this.prisma.user.findFirst({
        where: { email: dto.email.toLowerCase(), NOT: { id: userId } },
        select: { id: true },
      });
      if (conflict) throw new ConflictException('Email already in use');
    }

    const data: Record<string, unknown> = {};
    if (dto.fullName) data.fullName = dto.fullName;
    if (dto.email)    data.email    = dto.email.toLowerCase();
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: SAFE_SELECT,
    });
  }

  async remove(businessId: string, userId: string) {
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, businessId, role: 'salesperson' },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Staff member not found');

    await this.prisma.user.delete({ where: { id: userId } });
    return { message: 'Staff member removed' };
  }

  async getPermissions(businessId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, businessId, role: 'salesperson' },
      select: PERMISSION_SELECT,
    });
    if (!user) throw new NotFoundException('Staff member not found');
    return user;
  }

  async updatePermissions(businessId: string, userId: string, dto: UpdatePermissionsDto) {
    // permissions is a Json column — read current value and merge the provided flags
    const existing = await this.prisma.user.findFirst({
      where: { id: userId, businessId, role: 'salesperson' },
      select: { permissions: true },
    });
    if (!existing) throw new NotFoundException('Staff member not found');

    const current = (existing.permissions as unknown as UserPermissions) ?? { ...DEFAULT_SALESPERSON_PERMISSIONS };
    const merged: UserPermissions = { ...current };

    for (const [key, val] of Object.entries(dto)) {
      if (val !== undefined) {
        (merged as unknown as Record<string, unknown>)[key] = val;
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { permissions: merged as unknown as object },
      select: PERMISSION_SELECT,
    });
  }
}
