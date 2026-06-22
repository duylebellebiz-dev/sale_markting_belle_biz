import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import type { RequestUser } from '../decorators/current-user.decorator';
import type { UserPermissions } from '../../users/user-permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<keyof UserPermissions | undefined>(
      PERMISSION_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    // No @RequirePermission on this route — let it through
    if (!required) return true;

    const user: RequestUser = ctx.switchToHttp().getRequest().user;

    // Owners always pass
    if (user?.role === 'owner') return true;

    if (!user?.permissions?.[required]) {
      throw new ForbiddenException(
        `Permission denied: '${required}' is required for this action`,
      );
    }

    return true;
  }
}
