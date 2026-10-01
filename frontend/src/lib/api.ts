import axios from 'axios';

/**
 * Base API configurable. Par défaut relatif (`/api/v1`) : en dev le proxy Vite relaie vers le backend,
 * en production VPS Nginx proxifie `/api/` vers l'API (même origine).
 * Pour un frontend hébergé séparément (ex. GitHub Pages), définir VITE_API_URL au build
 * (ex. `https://api.exemple.sn/api/v1`) : le backend doit alors autoriser cette origine (FRONTEND_URL).
 */
export const API_BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

/** Un seul rafraîchissement à la fois (rotation des refresh tokens côté serveur : un jeton ne sert qu'une fois). */
function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true })
      .then((r) => (r.data?.accessToken as string) || null)
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error.response?.status;
    const config = error.config || {};
    if (status !== 401 || config._retried) return Promise.reject(error);
    // Visiteur anonyme (marketplace, vitrine publique) : un 401 sur une ressource protégée n'est pas une session expirée.
    if (!localStorage.getItem('accessToken')) return Promise.reject(error);
    const newToken = await refreshAccessToken();
    if (newToken) {
      localStorage.setItem('accessToken', newToken);
      config._retried = true;
      config.headers = { ...(config.headers || {}), Authorization: `Bearer ${newToken}` };
      return api.request(config);
    }
    // Session réellement expirée / révoquée : nettoyage local puis retour à la connexion.
    // Redirect relatif à la base Vite (compatible sous-chemin GitHub Pages).
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    const loginPath = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/login`;
    if (window.location.pathname !== loginPath) window.location.href = loginPath;
    return Promise.reject(error);
  }
);

export default api;
