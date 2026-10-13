import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { clearSession, getOrganizationId, getStoreId, getUser, isAuthenticated, setOrganization, setSession, type SessionUser } from '../lib/session';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  plan: string;
  stores: Array<{ id: string; name: string; slug: string }>;
}

interface AuthState {
  user: SessionUser | null;
  organizationId: string | null;
  organizations: OrganizationSummary[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  switchOrganization: (organizationId: string) => void;
  refreshOrganizations: () => Promise<void>;
  updateUser: (user: SessionUser) => void;
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  accountType: 'BUSINESS' | 'INDIVIDUAL';
  organizationName?: string;
  storeName?: string;
  region?: string;
  city?: string;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(getUser());
  const [organizationId, setOrgId] = useState<string | null>(getOrganizationId());
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(isAuthenticated());

  const refreshOrganizations = useCallback(async () => {
    if (!isAuthenticated()) {
      setOrganizations([]);
      return;
    }
    const data = await api.get<{ organizations: OrganizationSummary[] }>('/organizations');
    setOrganizations(data.organizations);
    // Sélectionne la première organisation si aucune n'est active ou si celle-ci n'est plus accessible.
    const current = getOrganizationId();
    if (data.organizations.length > 0 && (!current || !data.organizations.some((o) => o.id === current))) {
      const first = data.organizations[0];
      setOrganization(first.id, first.stores[0]?.id);
      setOrgId(first.id);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isAuthenticated()) {
        setLoading(false);
        return;
      }
      try {
        await refreshOrganizations();
      } catch {
        clearSession();
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshOrganizations]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ accessToken: string; refreshToken: string; user: SessionUser }>(
      '/auth/login',
      { email, password },
      { publicRoute: true },
    );
    setSession({ accessToken: data.accessToken, user: data.user });
    setUser(data.user);
    await refreshOrganizations();
  }, [refreshOrganizations]);

  const register = useCallback(async (input: RegisterInput) => {
    const data = await api.post<{
      accessToken: string;
      refreshToken: string;
      user: SessionUser;
      organization: { id: string } | null;
      store: { id: string } | null;
    }>('/auth/register', input, { publicRoute: true });
    setSession({
      accessToken: data.accessToken,
      user: data.user,
      ...(data.organization ? { organizationId: data.organization.id } : {}),
      ...(data.store ? { storeId: data.store.id } : {}),
    });
    setUser(data.user);
    setOrgId(data.organization?.id ?? null);
    // Le compte est créé à ce stade : un échec de l'enrichissement (liste des
    // organisations, réseau instable) ne doit jamais être présenté à l'utilisateur
    // comme un échec d'inscription. Il est rechargé à la prochaine navigation.
    try {
      await refreshOrganizations();
    } catch {
      // ignoré volontairement
    }
  }, [refreshOrganizations]);

  const updateUser = useCallback((nextUser: SessionUser) => {
    const accessToken = localStorage.getItem('gawjaay.accessToken');
    if (accessToken) {
      setSession({
        accessToken,
        user: nextUser,
        organizationId: getOrganizationId() ?? undefined,
        storeId: getStoreId() ?? undefined,
      });
    }
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    setOrganizations([]);
    setOrgId(null);
  }, []);

  const switchOrganization = useCallback((id: string) => {
    const org = organizations.find((o) => o.id === id);
    setOrganization(id, org?.stores[0]?.id);
    setOrgId(id);
  }, [organizations]);

  const value = useMemo<AuthState>(
    () => ({ user, organizationId, organizations, loading, login, register, logout, switchOrganization, refreshOrganizations, updateUser }),
    [user, organizationId, organizations, loading, login, register, logout, switchOrganization, refreshOrganizations, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
