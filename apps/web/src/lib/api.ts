import { getAccessToken, getOrganizationId } from './session';

/**
 * URL de base de l'API.
 *
 * `VITE_API_URL` est la SEULE source de vérité, injectée au build (GitHub Actions,
 * Render, docker-compose…). Aucune URL de production n'est codée en dur : cela
 * évite qu'un oubli de configuration ne fasse pointer la production vers un
 * serveur éphémère ou vers localhost.
 *
 *  - En développement (Vite), on retombe sur l'API locale `http://localhost:4000/api/v1`.
 *  - En production (build sans `VITE_API_URL`), l'application refuse de démarrer
 *    silencieusement : elle affiche un message explicite au lieu d'envoyer
 *    l'utilisateur vers un serveur qui n'existe pas.
 */
const DEV_FALLBACK = 'http://localhost:4000/api/v1';

export const API_BASE: string = (() => {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (configured) return configured;
  if (import.meta.env.DEV) return DEV_FALLBACK;
  return '';
})();

export const API_CONFIG_ERROR =
  'Configuration manquante : VITE_API_URL n’est pas définie pour cette version. ' +
  'L’application ne peut pas joindre l’API GawJaay.';

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
  if (!API_BASE) {
    throw new ApiError(0, 'CONFIG_ERROR', API_CONFIG_ERROR);
  }

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
