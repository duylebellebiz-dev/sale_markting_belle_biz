import { useAuth } from '../../context/AuthContext';
import type { UserPermissions } from './staffApi';

/**
 * Returns true if the current user has the given permission.
 * Owners always return true regardless of the flag value.
 * Use this for UI hints only — the backend is the real enforcer.
 */
export function usePermission(flag: keyof UserPermissions): boolean {
  const { user } = useAuth();
  if (!user) return false;
  if (user.role === 'owner') return true;
  return user.permissions?.[flag] ?? false;
}
