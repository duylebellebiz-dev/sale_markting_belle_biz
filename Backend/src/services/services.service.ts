import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  create(businessId: string, dto: CreateServiceDto) {
    return this.prisma.service.create({
      data: {
        businessId,
        name: dto.name,
        price: dto.price,
        isActive: dto.isActive ?? true,
      },
    });
  }

  findAll(businessId: string) {
    return this.prisma.service.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(businessId: string, id: string) {
    const service = await this.prisma.service.findFirst({
      where: { id, businessId },
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async update(businessId: string, id: string, dto: UpdateServiceDto) {
    const existing = await this.prisma.service.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Service not found');

    return this.prisma.service.update({
      where: { id },
      data: {
        ...(dto.name     !== undefined && { name: dto.name }),
        ...(dto.price    !== undefined && { price: dto.price }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(businessId: string, id: string) {
    const existing = await this.prisma.service.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Service not found');
    await this.prisma.service.delete({ where: { id } });
    return { message: 'Service deleted' };
  }
}
