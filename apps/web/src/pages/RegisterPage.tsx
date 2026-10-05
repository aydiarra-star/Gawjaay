import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SENEGAL_REGIONS } from '@gawjaay/shared';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { Alert } from '../components/ui';
import { IconBuilding, IconStore, IconUsers } from '../components/icons';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    accountType: 'BUSINESS' as 'BUSINESS' | 'INDIVIDUAL',
    organizationName: '',
    storeName: '',
    region: 'Dakar',
    city: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.accountType === 'BUSINESS' && (!form.organizationName.trim() || !form.storeName.trim())) {
      setError('Le nom de l’entreprise et de la boutique sont requis pour un compte boutique.');
      return;
    }
    if (form.password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setBusy(true);
    try {
      await register({
        accountType: form.accountType,
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        phone: form.phone || undefined,
        organizationName: form.organizationName,
        storeName: form.storeName,
        region: form.region,
        city: form.city || undefined,
      });
      navigate(form.accountType === 'INDIVIDUAL' ? '/seller' : '/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Inscription impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-page">
      <div className="auth-card wide">
        <Link to="/" className="brand" style={{ textDecoration: 'none', justifyContent: 'center', marginBottom: 24 }}>
          <span className="brand-mark">G</span>
          Gaw<span>Jaay</span>
        </Link>
        <div className="card" style={{ padding: 28 }}>
          <h1>{form.accountType === 'BUSINESS' ? 'Créer ma boutique' : 'Créer mon compte particulier'}</h1>
          <p className="muted small" style={{ marginBottom: 20 }}>
            Choisissez votre profil. Un compte boutique ouvre votre espace de gestion ; un compte particulier ouvre directement votre espace vendeur.
          </p>
          {error && <Alert kind="error">{error}</Alert>}

          <form onSubmit={onSubmit} noValidate>
            <div className="row" style={{ gap: 8, marginBottom: 20 }}>
              <button type="button" className={`btn btn-sm ${form.accountType === 'BUSINESS' ? '' : 'btn-secondary'}`} onClick={() => update('accountType', 'BUSINESS')}>
                <IconStore size={14} /> Boutique
              </button>
              <button type="button" className={`btn btn-sm ${form.accountType === 'INDIVIDUAL' ? '' : 'btn-secondary'}`} onClick={() => update('accountType', 'INDIVIDUAL')}>
                <IconUsers size={14} /> Particulier
              </button>
            </div>

            <div className="form-row">
              <div className="field">
                <label htmlFor="fullName">Nom complet</label>
                <input id="fullName" required value={form.fullName} onChange={(e) => update('fullName', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="phone">Téléphone (optionnel)</label>
                <input id="phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => update('email', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="password">Mot de passe (8 caractères minimum)</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
              />
            </div>

            {form.accountType === 'BUSINESS' && (
              <>
                <hr className="divider" />
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="organizationName">Nom de l'entreprise</label>
                    <input id="organizationName" required value={form.organizationName} onChange={(e) => update('organizationName', e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="storeName">Nom de la boutique</label>
                    <input id="storeName" required value={form.storeName} onChange={(e) => update('storeName', e.target.value)} />
                  </div>
                </div>
              </>
            )}
            <div className="form-row">
              <div className="field">
                <label htmlFor="region">Région</label>
                <select id="region" value={form.region} onChange={(e) => update('region', e.target.value)}>
                  {SENEGAL_REGIONS.map((r) => (
                    <option key={r.code} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="city">Ville (optionnel)</label>
                <input id="city" value={form.city} onChange={(e) => update('city', e.target.value)} />
              </div>
            </div>

            <button className="btn btn-block btn-lg" type="submit" disabled={busy}>
              {busy ? 'Création…' : 'Créer mon compte'}
            </button>
          </form>
          <hr className="divider" />
          <p className="small muted" style={{ textAlign: 'center' }}>
            Déjà un compte ? <Link to="/login">Se connecter</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
