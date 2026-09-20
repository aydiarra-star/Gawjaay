import { useState } from 'react';
import api from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { useNavigate, Link } from 'react-router-dom';

/** Page d'accueil par rôle après connexion (EMPLOYEE partage l'espace boutique, DRIVER a son app). */
export function homeForRole(role?: string) {
  switch (role) {
    case 'MERCHANT':
    case 'EMPLOYEE': return '/merchant';
    case 'DRIVER': return '/driver';
    case 'ADMIN': return '/admin';
    default: return '/marketplace';
  }
}

export default function Login() {
  // V3 (sécurité) : plus aucun identifiant pré-rempli ni liste de comptes de démonstration dans l'UI.
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const submit = async (e: any) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const res = await api.post('/auth/login', { phone: phone.trim(), password });
      setAuth(res.data.user, res.data.accessToken);
      navigate(homeForRole(res.data.user.role));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur connexion');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded shadow">
      <h1 className="text-2xl font-bold mb-4">Connexion GawJaay</h1>
      {error && <div className="bg-red-100 text-red-700 p-2 mb-3 rounded" role="alert">{error}</div>}
      <form onSubmit={submit} className="space-y-4">
        <input className="w-full border p-3 rounded" type="tel" autoComplete="username" inputMode="tel" placeholder="Téléphone +221..." value={phone} onChange={e=>setPhone(e.target.value)} required />
        <input className="w-full border p-3 rounded" type="password" autoComplete="current-password" placeholder="Mot de passe" value={password} onChange={e=>setPassword(e.target.value)} required />
        <button className="w-full bg-green-700 text-white p-3 rounded disabled:bg-gray-300" disabled={busy}>Se connecter</button>
      </form>
      <p className="mt-4 text-sm">Pas de compte ? <Link to="/register" className="text-green-700">S'inscrire</Link></p>
    </div>
  );
}
