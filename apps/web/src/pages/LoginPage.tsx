import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { Alert } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-page">
      <div className="auth-card">
        <Link to="/" className="brand" style={{ textDecoration: 'none', justifyContent: 'center', marginBottom: 24 }}>
          <span className="brand-mark">G</span>
          Gaw<span>Jaay</span>
        </Link>
        <div className="card" style={{ padding: 28 }}>
          <h1>Connexion</h1>
          <p className="muted small" style={{ marginBottom: 20 }}>
            Accédez à votre espace GawJaay.
          </p>
          {error && <Alert kind="error">{error}</Alert>}
          <form onSubmit={onSubmit} noValidate>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="password">Mot de passe</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="btn btn-block btn-lg" type="submit" disabled={busy}>
              {busy ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
          <hr className="divider" />
          <p className="small muted" style={{ textAlign: 'center' }}>
            Pas encore de compte ? <Link to="/register">Créer ma boutique</Link>
          </p>
        </div>
        <p className="small muted" style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/">← Retour à l'accueil</Link>
        </p>
      </div>
    </div>
  );
}
