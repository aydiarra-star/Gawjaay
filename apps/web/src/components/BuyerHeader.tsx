import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { IconCart } from './icons';

/**
 * En-tête commun des pages acheteur (Marketplace, produit, panier, commandes).
 * Affiche le panier courant et l'accès compte, sans dupliquer la navigation marchande.
 */
export function BuyerHeader({ showCart = true }: { showCart?: boolean }) {
  const { user } = useAuth();
  const { count } = useCart();
  return (
    <header className="topbar">
      <Link to="/" className="brand" style={{ textDecoration: 'none' }}>
        <span className="brand-mark">G</span>
        Gaw<span>Jaay</span>
      </Link>
      <div className="topbar-spacer" />
      <div className="row" style={{ gap: 8 }}>
        <Link to="/marketplace" className="btn btn-secondary btn-sm">Marketplace</Link>
        <Link to="/register" className="btn btn-secondary btn-sm">Vendre</Link>
        {showCart && (
          <Link to="/cart" className="btn btn-secondary btn-sm" aria-label="Panier">
            <IconCart size={16} /> Panier{count > 0 ? ` (${count})` : ''}
          </Link>
        )}
        {user ? (
          <Link to="/orders" className="btn btn-sm">
            Mes commandes
          </Link>
        ) : (
          <Link to="/login" className="btn btn-sm">
            Connexion
          </Link>
        )}
      </div>
    </header>
  );
}

export function BuyerShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <BuyerHeader />
      <main className="main">
        <div className="main-inner">{children}</div>
      </main>
    </div>
  );
}
