import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  async register(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const normalizedEmail = this.normalizeEmail(dto.email);

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const business = await this.prisma.business.create({
      data: {
        businessName: dto.businessName,
        email: normalizedEmail,
        passwordHash,
      },
    });

    const user = await this.prisma.user.create({
      data: {
        businessId: business.id,
        fullName: dto.businessName,
        email: normalizedEmail,
        passwordHash,
        role: 'owner',
      },
    });

    return { message: 'Business registered successfully', userId: user.id };
  }

  async login(dto: LoginDto) {
    const normalizedEmail = this.normalizeEmail(dto.email);

    let user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user) {
      const valid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('Invalid credentials');
      }
    } else {
      // Backward compatibility: older owner accounts may exist only on Business.
      const business = await this.prisma.business.findUnique({
        where: { email: normalizedEmail },
      });
      if (!business) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const valid = await bcrypt.compare(dto.password, business.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      user = await this.prisma.user.create({
        data: {
          businessId: business.id,
          fullName: business.businessName,
          email: normalizedEmail,
          passwordHash: business.passwordHash,
          role: 'owner',
        },
      });
    }

    const payload = {
      sub: user.id,
      businessId: user.businessId,
      role: user.role,
    };

    const token = this.jwtService.sign(payload);

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        businessId: user.businessId,
      },
    };
  }
}
