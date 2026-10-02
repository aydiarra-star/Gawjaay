import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import {
  IconBike,
  IconBuilding,
  IconCart,
  IconChart,
  IconClose,
  IconDownload,
  IconHome,
  IconLedger,
  IconLogout,
  IconMarket,
  IconMenu,
  IconPackage,
  IconReceipt,
  IconSettings,
  IconStore,
  IconTag,
  IconTruck,
  IconUsers,
} from './icons';

type IconCmp = (p: { size?: number }) => JSX.Element;

/* Univers regroupés : Boutique (opérations) · Comptabilité (analyse) · Système */
const NAV_GROUPS: Array<{ label: string; items: Array<{ to: string; label: string; icon: IconCmp; exact?: boolean }> }> = [
  {
    label: 'Pilotage',
    items: [
      { to: '/app', label: 'Accueil', icon: IconHome, exact: true },
      { to: '/app/pos', label: 'Caisse', icon: IconCart },
      { to: '/app/orders', label: 'Commandes', icon: IconReceipt },
      { to: '/app/deliveries', label: 'Livraisons', icon: IconBike },
    ],
  },
  {
    label: 'Boutique',
    items: [
      { to: '/app/products', label: 'Produits', icon: IconPackage },
      { to: '/app/stock', label: 'Stock', icon: IconTag },
      { to: '/app/customers', label: 'Clients', icon: IconUsers },
      { to: '/app/suppliers', label: 'Fournisseurs', icon: IconTruck },
      { to: '/app/purchases', label: 'Achats', icon: IconDownload },
    ],
  },
  {
    label: 'Comptabilité',
    items: [{ to: '/app/reports', label: 'Rapports', icon: IconChart }],
  },
  {
    label: 'Organisation',
    items: [{ to: '/app/settings', label: 'Paramètres', icon: IconSettings }],
  },
];

/* Barre inférieure mobile : 5 univers, navigation au pouce */
const BOTTOM = [
  { to: '/app', label: 'Accueil', icon: IconHome, exact: true },
  { to: '/app/pos', label: 'Caisse', icon: IconCart },
  { to: '/marketplace', label: 'Marché', icon: IconMarket, publicRoute: true },
  { to: '/app/products', label: 'Boutique', icon: IconStore },
  { to: '/app/reports', label: 'Compta', icon: IconLedger },
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

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

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
          {open ? <IconClose size={20} /> : <IconMenu size={20} />}
        </button>
        <Link to="/app" className="brand" style={{ textDecoration: 'none' }}>
          <span className="brand-mark">G</span>
          Gaw<span>Jaay</span>
        </Link>
        <div className="topbar-spacer" />

        <div className="row" style={{ gap: 10 }}>
          {organizations.length > 1 && (
            <select
              aria-label="Organisation active"
              value={organizationId ?? ''}
              onChange={(e) => switchOrganization(e.target.value)}
              style={{ width: 'auto', maxWidth: 190, minHeight: 38 }}
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          {stores.length > 0 && <StoreSwitcher />}
          <span className="avatar" title={user?.fullName ?? ''}>
            {(user?.fullName ?? '?').charAt(0).toUpperCase()}
          </span>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onLogout} aria-label="Déconnexion" title="Déconnexion">
            <IconLogout size={18} />
          </button>
        </div>
      </header>

      <div className="layout-body">
        <div className={`sidebar-backdrop ${open ? 'open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />

        <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Navigation principale">
          {activeOrg && (
            <div className="side-org">
              <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                <span className="avatar" style={{ background: 'var(--surface-3)', color: 'var(--ink-2)' }}>
                  <IconBuilding size={17} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="side-org-name">{activeOrg.name}</div>
                  <span className="badge badge-primary" style={{ marginTop: 2 }}>
                    {activeOrg.plan}
                  </span>
                </div>
              </div>
            </div>
          )}

          {NAV_GROUPS.map((group) => (
            <div className="side-group" key={group.label}>
              <div className="side-group-label">{group.label}</div>
              {group.items.map((item) => {
                const active = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`nav-link ${active ? 'active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}

          <div className="divider" />
          <Link to="/marketplace" className="nav-link">
            <IconMarket size={18} />
            Voir la marketplace
          </Link>
        </nav>

        <main className="main" id="main-content">
          <div className="main-inner">{children}</div>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Navigation rapide">
        {BOTTOM.map((item) => {
          const active = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`bottom-link ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={21} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function StoreSwitcher() {
  const { stores, storeId, setStoreId } = useStore();
  return (
    <select
      aria-label="Boutique active"
      value={storeId ?? ''}
      onChange={(e) => setStoreId(e.target.value)}
      style={{ width: 'auto', maxWidth: 170, minHeight: 38 }}
    >
      {stores.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
