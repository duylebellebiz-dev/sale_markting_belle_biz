import { SetMetadata } from '@nestjs/common';
import type { UserPermissions } from '../../users/user-permissions';

export const PERMISSION_KEY = 'requiredPermission';

export const RequirePermission = (permission: keyof UserPermissions) =>
  SetMetadata(PERMISSION_KEY, permission);
