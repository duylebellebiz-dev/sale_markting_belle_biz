import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserPermissions } from '../../users/user-permissions';

export interface RequestUser {
  userId: string;
  businessId: string;
  role: 'owner' | 'salesperson';
  permissions: UserPermissions;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as RequestUser;
  },
);
