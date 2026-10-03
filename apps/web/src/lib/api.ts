import { getAccessToken, getOrganizationId } from './session';

/**
 * URL de base de l'API — résolue à l'EXÉCUTION, dans cet ordre :
 *
 *  1. `window.__GAWJAAY_CONFIG__.apiUrl` (fichier `config.js` servi par GitHub Pages) :
 *     permet de pointer le site vers un backend SANS reconstruire ni toucher aux workflows.
 *  2. `VITE_API_URL` : injecté au build par GitHub Actions (CI) ou docker-compose.
 *  3. Développement local : `http://localhost:4000/api/v1`.
 *
 * En production, si aucune des deux premières sources n'est définie, l'application
 * refuse de démarrer silencieusement : elle affiche un message explicite au lieu
 * d'envoyer l'utilisateur vers un serveur qui n'existe pas. Aucune URL de
 * production n'est codée en dur.
 */
const DEV_FALLBACK = 'http://localhost:4000/api/v1';

export const API_BASE: string = (() => {
  const runtime = window.__GAWJAAY_CONFIG__?.apiUrl?.trim();
  if (runtime) return runtime;

  const buildTime = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (buildTime) return buildTime;

  if (import.meta.env.DEV) return DEV_FALLBACK;
  return '';
})();

export const API_CONFIG_ERROR =
  'Le service GawJaay n’est pas encore connecté à cette adresse. ' +
  'Renseignez l’URL de l’API dans le fichier config.js (ou la variable VITE_API_URL).';

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
  /** Réponse binaire (ex. export CSV) : ne pas tenter de la décoder en JSON. */
  blob?: boolean;
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

  if (options.blob && res.ok) {
    return (await res.blob()) as T;
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
