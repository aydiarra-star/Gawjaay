import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
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
    refreshing = axios.post('/api/v1/auth/refresh', {}, { withCredentials: true })
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
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    return Promise.reject(error);
  }
);

export default api;
