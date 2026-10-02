import { Link } from 'react-router-dom';
import { IconMarket } from '../components/icons';

export function NotFoundPage() {
  return (
    <div className="center-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="card" style={{ padding: 32 }}>
          <span
            className="feature-icon"
            style={{ margin: '0 auto 16px', width: 56, height: 56, borderRadius: 'var(--r)' }}
          >
            <IconMarket size={24} />
          </span>
          <h1>Page introuvable</h1>
          <p className="muted" style={{ marginTop: 8 }}>
            La page demandée n'existe pas ou a été déplacée.
          </p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
            <Link to="/" className="btn">
              Accueil
            </Link>
            <Link to="/app" className="btn btn-secondary">
              Mon espace
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
