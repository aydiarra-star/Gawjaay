import { useState } from 'react';
import api from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { useNavigate, Link } from 'react-router-dom';

export default function Login() {
  const [phone, setPhone] = useState('+221770000001');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState('');
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const submit = async (e: any) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post('/auth/login', { phone, password });
      setAuth(res.data.user, res.data.accessToken);
      if (res.data.user.role === 'MERCHANT') navigate('/merchant');
      else if (res.data.user.role === 'ADMIN') navigate('/admin');
      else navigate('/marketplace');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur connexion');
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded shadow">
      <h1 className="text-2xl font-bold mb-4">Connexion GawJaay</h1>
      {error && <div className="bg-red-100 text-red-700 p-2 mb-3 rounded">{error}</div>}
      <form onSubmit={submit} className="space-y-4">
        <input className="w-full border p-2 rounded" placeholder="Téléphone +221..." value={phone} onChange={e=>setPhone(e.target.value)} />
        <input className="w-full border p-2 rounded" type="password" placeholder="Mot de passe" value={password} onChange={e=>setPassword(e.target.value)} />
        <button className="w-full bg-green-700 text-white p-2 rounded">Se connecter</button>
      </form>
      <p className="mt-4 text-sm">Pas de compte ? <Link to="/register" className="text-green-700">S'inscrire</Link></p>
      <div className="mt-6 text-xs bg-gray-50 p-3 rounded">
        <p className="font-bold">Comptes démo (seed):</p>
        <p>Admin: +221700000001 / Password123!</p>
        <p>Marchand: +221770000001 / Password123!</p>
        <p>Client: +221760000001 / Password123!</p>
      </div>
    </div>
  );
}
