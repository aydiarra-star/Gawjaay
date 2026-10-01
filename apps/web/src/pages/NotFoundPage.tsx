import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="center-page">
      <div className="card auth-card" style={{ textAlign: 'center' }}>
        <h1>Page introuvable</h1>
        <p className="muted">La page demandée n'existe pas ou a été déplacée.</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <Link to="/" className="btn">
            Accueil
          </Link>
          <Link to="/app" className="btn btn-secondary">
            Mon espace
          </Link>
        </div>
      </div>
    </div>
  );
}
