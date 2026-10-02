import { getAccessToken, getOrganizationId } from './session';

/**
 * URL de base de l'API.
 *
 * Résolution, du plus prioritaire au moins prioritaire :
 *  1. `VITE_API_URL` (variable/secret défini au build — ex. GitHub Actions).
 *  2. En production, l'origine servie sur GitHub Pages (`aydiarra-star.github.io`)
 *     pointe par défaut vers l'API publique, afin qu'un oubli de variable ne
 *     laisse pas une vitrine silencieusement cassée.
 *  3. Sinon : API locale de développement.
 */
function resolveApiBase(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (configured && configured.trim()) return configured.trim();
  if (typeof window !== 'undefined' && /(^|\.)github\.io$/i.test(window.location.hostname)) {
    return 'https://work-1-xkxpfbzjsaxyifxx.prod-runtime.all-hands.dev/api/v1';
  }
  return 'http://localhost:4000/api/v1';
}

export const API_BASE: string = resolveApiBase();

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Route publique : ne pas envoyer d'en-tête d'authentification. */
  publicRoute?: boolean;
  signal?: AbortSignal;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!options.publicRoute) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const orgId = getOrganizationId();
    if (orgId) headers['x-organization-id'] = orgId;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', "Impossible de joindre le serveur GawJaay. Vérifiez votre connexion.");
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const error = data?.error ?? {};
    throw new ApiError(res.status, error.code ?? 'ERROR', error.message ?? 'Une erreur est survenue', error.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => apiRequest<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => apiRequest<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => apiRequest<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts?: RequestOptions) => apiRequest<T>(path, { ...opts, method: 'DELETE' }),
};
