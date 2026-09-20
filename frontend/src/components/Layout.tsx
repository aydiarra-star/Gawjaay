import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import api from '../lib/api';

/** Liens de navigation par rôle (un EMPLOYEE partage l'espace boutique, un DRIVER a son application). */
function linksFor(role?: string): Array<{ to: string; label: string }> {
  const links = [{ to: '/marketplace', label: 'Marketplace' }];
  if (role === 'MERCHANT' || role === 'EMPLOYEE') links.push({ to: '/merchant', label: 'Boutiques' });
  if (role === 'MERCHANT') links.push({ to: '/merchant/b2b/orders', label: 'B2B' });
  if (role === 'CLIENT') links.push({ to: '/orders', label: 'Commandes' });
  if (role === 'DRIVER') links.push({ to: '/driver', label: 'Mes livraisons' });
  if (role === 'ADMIN') links.push({ to: '/admin', label: 'Admin' });
  return links;
}

const ROLE_LABELS: Record<string, string> = { CLIENT: 'Client', MERCHANT: 'Commerçant', EMPLOYEE: 'Employé', DRIVER: 'Livreur', ADMIN: 'Admin' };

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Mobile : le menu se referme à chaque navigation.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /* le token local est révoqué quoi qu'il arrive */ }
    logout();
    navigate('/login');
  };

  const links = linksFor(user?.role);
  const linkClass = ({ isActive }: { isActive: boolean }) => `block md:inline px-2 py-2 md:py-1 rounded hover:bg-green-800 ${isActive ? 'bg-green-800 font-semibold' : ''}`;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-green-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center gap-3">
          <Link to="/" className="font-bold text-xl">GawJaay</Link>
          <button
            type="button"
            className="md:hidden border border-white/70 rounded px-3 py-1 text-sm"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >☰ Menu</button>
          <nav className="hidden md:flex gap-2 items-center text-sm" aria-label="Navigation principale">
            {links.map((l) => <NavLink key={l.to} to={l.to} className={linkClass} end={l.to === '/merchant'}>{l.label}</NavLink>)}
            {user ? (
              <>
                <span className="text-xs opacity-90 ml-2">{user.phone} · {ROLE_LABELS[user.role] || user.role}</span>
                <button onClick={handleLogout} className="bg-white text-green-700 px-3 py-1 rounded">Déconnexion</button>
              </>
            ) : (
              <>
                <Link to="/login" className="bg-white text-green-700 px-3 py-1 rounded">Connexion</Link>
                <Link to="/register" className="border border-white px-3 py-1 rounded">Inscription</Link>
              </>
            )}
          </nav>
        </div>
        {open && (
          <nav className="md:hidden border-t border-green-600 px-4 py-2 space-y-1 text-sm" aria-label="Navigation mobile">
            {links.map((l) => <NavLink key={l.to} to={l.to} className={linkClass} end={l.to === '/merchant'}>{l.label}</NavLink>)}
            {user ? (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs opacity-90">{user.phone} · {ROLE_LABELS[user.role] || user.role}</span>
                <button onClick={handleLogout} className="bg-white text-green-700 px-3 py-1 rounded">Déconnexion</button>
              </div>
            ) : (
              <div className="flex gap-2 pt-2">
                <Link to="/login" className="bg-white text-green-700 px-3 py-1 rounded">Connexion</Link>
                <Link to="/register" className="border border-white px-3 py-1 rounded">Inscription</Link>
              </div>
            )}
          </nav>
        )}
      </header>
      <main className="flex-1 w-full p-4 md:p-6 max-w-7xl mx-auto">{children}</main>
      <footer className="text-center p-4 text-gray-500 text-sm">GawJaay © {new Date().getFullYear()} - Vendre vite. Gérer mieux. Sénégal</footer>
    </div>
  );
}
