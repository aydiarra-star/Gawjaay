/**
 * Session côté client. Le jeton d'accès et l'organisation active sont conservés
 * dans localStorage. Les jetons restent vérifiés côté serveur à chaque requête :
 * le client n'est jamais une source d'autorisation.
 */
const ACCESS_KEY = 'gawjaay.accessToken';
const ORG_KEY = 'gawjaay.organizationId';
const USER_KEY = 'gawjaay.user';
const STORE_KEY = 'gawjaay.storeId';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  platformAdmin: boolean;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getOrganizationId(): string | null {
  return localStorage.getItem(ORG_KEY);
}

export function getStoreId(): string | null {
  return localStorage.getItem(STORE_KEY);
}

export function getUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function setSession(session: { accessToken: string; user: SessionUser; organizationId?: string; storeId?: string }): void {
  localStorage.setItem(ACCESS_KEY, session.accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  if (session.organizationId) localStorage.setItem(ORG_KEY, session.organizationId);
  if (session.storeId) localStorage.setItem(STORE_KEY, session.storeId);
}

export function setOrganization(organizationId: string, storeId?: string): void {
  localStorage.setItem(ORG_KEY, organizationId);
  if (storeId) localStorage.setItem(STORE_KEY, storeId);
  else localStorage.removeItem(STORE_KEY);
}

export function setStore(storeId: string | null): void {
  if (storeId) localStorage.setItem(STORE_KEY, storeId);
  else localStorage.removeItem(STORE_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(ORG_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(STORE_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}
