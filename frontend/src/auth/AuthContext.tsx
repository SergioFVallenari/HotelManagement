import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api/client';
import type { LoginCompany, User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  pendingCompanies: LoginCompany[] | null;
  login: (username: string, password: string) => Promise<void>;
  selectCompany: (companyId: number) => Promise<void>;
  cancelLogin: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [pendingCompanies, setPendingCompanies] = useState<LoginCompany[] | null>(null);
  const [pendingCredentials, setPendingCredentials] = useState<{ username: string; password: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    const handler = () => setUser(null);
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api<{ companies: LoginCompany[] }>('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    setPendingCredentials({ username, password });
    setPendingCompanies(result.companies);
  }, []);

  const selectCompany = useCallback(
    async (companyId: number) => {
      if (!pendingCredentials) return;
      const result = await api<{ user: User }>('/auth/login/company', {
        method: 'POST',
        body: { companyId, ...pendingCredentials },
      });
      setUser(result.user);
      setPendingCompanies(null);
      setPendingCredentials(null);
    },
    [pendingCredentials],
  );

  const cancelLogin = useCallback(() => {
    setPendingCompanies(null);
    setPendingCredentials(null);
  }, []);

  const logout = useCallback(() => {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, pendingCompanies, login, selectCompany, cancelLogin, logout }),
    [user, loading, pendingCompanies, login, selectCompany, cancelLogin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}