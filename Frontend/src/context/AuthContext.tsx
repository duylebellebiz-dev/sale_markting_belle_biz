import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import api from '../lib/api';
import type { UserPermissions } from '../features/staff/staffApi';

export type UserRole = 'owner' | 'salesperson';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  businessId: string;
  permissions?: UserPermissions;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  refreshPermissions: () => Promise<void>;
}

export interface RegisterData {
  businessName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

// Shape of what GET /me returns
interface MeResponse {
  userId: string;
  businessId: string;
  role: UserRole;
  permissions: UserPermissions;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredAuth(): AuthState {
  try {
    const token = localStorage.getItem('token');
    const raw = localStorage.getItem('user');
    const user: AuthUser | null = raw ? JSON.parse(raw) : null;
    return { user, token, isLoading: false };
  } catch {
    return { user: null, token: null, isLoading: false };
  }
}

async function fetchPermissions(): Promise<UserPermissions | null> {
  try {
    const res = await api.get<{ data: MeResponse }>('/me');
    return res.data.data.permissions ?? null;
  } catch {
    return null;
  }
}

/** Verifies the stored session is still valid against the DB. Returns false if the business no longer exists. */
async function validateSession(): Promise<boolean> {
  try {
    await api.get('/businesses/me');
    return true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, token: null, isLoading: true });

  // Rehydrate from localStorage, then refresh permissions from /me
  useEffect(() => {
    const stored = loadStoredAuth();
    if (stored.token && stored.user) {
      // Optimistically set the user so protected routes render immediately,
      // then validate the session against the DB in the background.
      setState(stored);
      validateSession().then((valid) => {
        if (!valid) {
          // Token is stale (e.g. DB was reset) — force re-login
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setState({ user: null, token: null, isLoading: false });
          return;
        }
        // Silently refresh permissions so owner changes take effect
        fetchPermissions().then((permissions) => {
          if (permissions) {
            const updated: AuthUser = { ...stored.user!, permissions };
            localStorage.setItem('user', JSON.stringify(updated));
            setState((s) => ({ ...s, user: updated }));
          }
        });
      });
    } else {
      setState({ user: null, token: null, isLoading: false });
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{ accessToken: string; user: AuthUser }>(
      '/auth/login',
      { email, password },
    );
    // Fetch fresh permissions immediately after login
    localStorage.setItem('token', data.accessToken);
    const permissions = await fetchPermissions();
    const user: AuthUser = { ...data.user, ...(permissions ? { permissions } : {}) };
    localStorage.setItem('user', JSON.stringify(user));
    setState({ user, token: data.accessToken, isLoading: false });
  }, []);

  const register = useCallback(async (formData: RegisterData) => {
    await api.post('/auth/register', formData);
    await login(formData.email, formData.password);
  }, [login]);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setState({ user: null, token: null, isLoading: false });
  }, []);

  // Owner calls this after updating a salesperson's permissions so the panel
  // can inform the user that changes are live on the next salesperson login.
  // (For the salesperson's own session, the backend always reads fresh from DB.)
  const refreshPermissions = useCallback(async () => {
    const permissions = await fetchPermissions();
    if (permissions && state.user) {
      const updated: AuthUser = { ...state.user, permissions };
      localStorage.setItem('user', JSON.stringify(updated));
      setState((s) => ({ ...s, user: updated }));
    }
  }, [state.user]);

  const value = useMemo(
    () => ({ ...state, login, register, logout, refreshPermissions }),
    [state, login, register, logout, refreshPermissions],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
