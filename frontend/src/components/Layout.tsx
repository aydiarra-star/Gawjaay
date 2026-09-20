import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import api from '../lib/api';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await api.post('/auth/logout');
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-700 text-white p-4 flex justify-between items-center">
        <Link to="/" className="font-bold text-xl">GawJaay</Link>
        <nav className="flex gap-4 items-center">
          <Link to="/marketplace" className="hover:underline">Marketplace</Link>
          {user?.role === 'MERCHANT' && <Link to="/merchant" className="hover:underline">Boutiques</Link>}
          {user?.role === 'CLIENT' && <Link to="/orders" className="hover:underline">Commandes</Link>}
          {user?.role === 'ADMIN' && <Link to="/admin" className="hover:underline">Admin</Link>}
          {user ? (
            <>
              <span className="text-sm">{user.phone} ({user.role})</span>
              <button onClick={handleLogout} className="bg-white text-green-700 px-3 py-1 rounded">Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" className="bg-white text-green-700 px-3 py-1 rounded">Connexion</Link>
              <Link to="/register" className="border border-white px-3 py-1 rounded">Inscription</Link>
            </>
          )}
        </nav>
      </header>
      <main className="p-6 max-w-7xl mx-auto">{children}</main>
      <footer className="text-center p-4 text-gray-500 text-sm">GawJaay © {new Date().getFullYear()} - Vendre vite. Gérer mieux. Sénégal</footer>
    </div>
  );
}
