import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const NAV = [
  { to: '/app', label: 'Tableau de bord', icon: '📊', exact: true },
  { to: '/app/pos', label: 'Vente (POS)', icon: '🛒' },
  { to: '/app/products', label: 'Produits', icon: '📦' },
  { to: '/app/stock', label: 'Stock', icon: '🏷️' },
  { to: '/app/orders', label: 'Commandes', icon: '🧾' },
  { to: '/app/customers', label: 'Clients', icon: '👥' },
  { to: '/app/suppliers', label: 'Fournisseurs', icon: '🚚' },
  { to: '/app/purchases', label: 'Achats', icon: '📥' },
  { to: '/app/deliveries', label: 'Livraisons', icon: '🛵' },
  { to: '/app/reports', label: 'Rapports', icon: '📈' },
  { to: '/app/settings', label: 'Paramètres', icon: '⚙️' },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, organizations, organizationId, switchOrganization, logout } = useAuth();
  const { stores } = useStore();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const onLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const activeOrg = organizations.find((o) => o.id === organizationId);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Aller au contenu
      </a>
      <header className="topbar">
        <button className="hamburger" aria-label="Ouvrir le menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          ☰
        </button>
        <Link to="/app" className="brand" style={{ textDecoration: 'none' }}>
          Gaw<span>Jaay</span>
        </Link>
        <div className="topbar-spacer" />
        <div className="row">
          {organizations.length > 1 && (
            <select
              aria-label="Organisation active"
              value={organizationId ?? ''}
              onChange={(e) => switchOrganization(e.target.value)}
              style={{ width: 'auto', maxWidth: 200 }}
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          {stores.length > 0 && <StoreSwitcher />}
          <span className="small muted" style={{ display: 'none' }} aria-hidden="true">
            {user?.fullName}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={onLogout}>
            Déconnexion
          </button>
        </div>
      </header>

      <div className="layout-body">
        <div className={`sidebar-backdrop ${open ? 'open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
        <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Navigation principale">
          {activeOrg && (
            <div className="small muted" style={{ padding: '4px 12px 10px' }}>
              {activeOrg.name}
              <br />
              <span className="badge badge-primary">{activeOrg.plan}</span>
            </div>
          )}
          {NAV.map((item) => {
            const active = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}>
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="main" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}

function StoreSwitcher() {
  const { stores, storeId, setStoreId } = useStore();
  return (
    <select aria-label="Boutique active" value={storeId ?? ''} onChange={(e) => setStoreId(e.target.value)} style={{ width: 'auto', maxWidth: 180 }}>
      {stores.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
