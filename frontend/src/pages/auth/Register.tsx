import { useState } from 'react';
import api from '../../lib/api';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/auth';

export default function Register() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('CLIENT');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();

  const submit = async (e: any) => {
    e.preventDefault();
    try {
      const res = await api.post('/auth/register', { phone, password, role, name });
      setAuth(res.data.user, res.data.accessToken);
      navigate(role === 'MERCHANT' ? '/merchant' : '/marketplace');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur inscription');
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white p-6 rounded shadow">
      <h1 className="text-2xl font-bold mb-4">Inscription</h1>
      {error && <div className="bg-red-100 text-red-700 p-2 mb-3 rounded">{error}</div>}
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full border p-2 rounded" placeholder="Téléphone +221..." value={phone} onChange={e=>setPhone(e.target.value)} required />
        <input className="w-full border p-2 rounded" type="password" placeholder="Mot de passe (8+)" value={password} onChange={e=>setPassword(e.target.value)} required />
        <input className="w-full border p-2 rounded" placeholder="Nom / Business (optionnel)" value={name} onChange={e=>setName(e.target.value)} />
        <select className="w-full border p-2 rounded" value={role} onChange={e=>setRole(e.target.value)}>
          <option value="CLIENT">Client</option>
          <option value="MERCHANT">Commerçant</option>
        </select>
        <button className="w-full bg-green-700 text-white p-2 rounded">S'inscrire</button>
      </form>
      <p className="mt-4 text-sm">Déjà compte ? <Link to="/login" className="text-green-700">Connexion</Link></p>
    </div>
  );
}
