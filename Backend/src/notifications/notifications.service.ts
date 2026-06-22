import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/decorators/current-user.decorator';

export interface CreateNotificationParams {
  businessId: string;
  targetUserId: string;
  type: NotificationType;
  message: string;
  relatedId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Called internally by the reminder engine — not exposed as an HTTP route
  create(params: CreateNotificationParams) {
    return this.prisma.notification.create({
      data: {
        businessId: params.businessId,
        targetUserId: params.targetUserId,
        type: params.type,
        message: params.message,
        relatedId: params.relatedId ?? null,
      },
    });
  }

  // Returns paginated notifications for the calling user, newest first.
  // Owners see ALL notifications in their business; salespeople see only their own.
  async findForUser(user: RequestUser, page = 1, limit = 20) {
    const where: Prisma.NotificationWhereInput = {
      businessId: user.businessId,
    };
    if (user.role !== 'owner') {
      where.targetUserId = user.userId;
    }
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, total, page, limit, hasMore: skip + data.length < total };
  }

  // Unread count — lightweight for polling / badge display
  async countUnread(user: RequestUser) {
    const where: Prisma.NotificationWhereInput = {
      businessId: user.businessId,
      isRead: false,
    };
    if (user.role !== 'owner') {
      where.targetUserId = user.userId;
    }
    const count = await this.prisma.notification.count({ where });
    return { unread: count };
  }

  async markRead(user: RequestUser, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        id,
        targetUserId: user.userId,
        businessId: user.businessId,
      },
      data: { isRead: true },
    });
    if (!result.count) throw new NotFoundException('Notification not found');
    return this.prisma.notification.findUnique({ where: { id } });
  }

  async deleteOne(user: RequestUser, id: string) {
    const where: Prisma.NotificationWhereInput = {
      id,
      businessId: user.businessId,
    };
    if (user.role !== 'owner') {
      where.targetUserId = user.userId;
    }
    const result = await this.prisma.notification.deleteMany({ where });
    if (!result.count) throw new NotFoundException('Notification not found');
    return { deleted: result.count };
  }

  async deleteAll(user: RequestUser) {
    const where: Prisma.NotificationWhereInput = {
      businessId: user.businessId,
    };
    if (user.role !== 'owner') {
      where.targetUserId = user.userId;
    }
    const result = await this.prisma.notification.deleteMany({ where });
    return { deleted: result.count };
  }

  async markAllRead(user: RequestUser) {
    const where: Prisma.NotificationWhereInput = {
      businessId: user.businessId,
      isRead: false,
    };
    if (user.role !== 'owner') {
      where.targetUserId = user.userId;
    }
    const result = await this.prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });
    return { updated: result.count };
  }
}
