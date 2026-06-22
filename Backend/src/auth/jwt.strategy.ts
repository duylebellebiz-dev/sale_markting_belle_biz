import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_SALESPERSON_PERMISSIONS, UserPermissions } from '../users/user-permissions';

export interface JwtPayload {
  sub: string;        // userId
  businessId: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    let permissions: UserPermissions = { ...DEFAULT_SALESPERSON_PERMISSIONS };

    if (payload.role === 'salesperson') {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { permissions: true },
      });
      if (user?.permissions) {
        permissions = user.permissions as unknown as UserPermissions;
      }
    }

    return {
      userId: payload.sub,
      businessId: payload.businessId,
      role: payload.role as 'owner' | 'salesperson',
      permissions,
    };
  }
}
