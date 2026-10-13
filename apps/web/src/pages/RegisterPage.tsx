import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SENEGAL_REGIONS } from '@gawjaay/shared';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { Alert } from '../components/ui';
import { IconStore, IconUsers } from '../components/icons';

type FieldKey =
  | 'fullName'
  | 'email'
  | 'password'
  | 'phone'
  | 'organizationName'
  | 'storeName'
  | 'region'
  | 'city';

/** Libellés affichés dans les messages d'erreur (identiques aux labels du formulaire). */
const FIELD_LABELS: Record<FieldKey, string> = {
  fullName: 'Nom complet',
  email: 'Email',
  password: 'Mot de passe',
  phone: 'Téléphone',
  organizationName: "Nom de l'entreprise",
  storeName: 'Nom de la boutique',
  region: 'Région',
  city: 'Ville',
};

const FIELD_KEYS = Object.keys(FIELD_LABELS) as FieldKey[];

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
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    // Le message d'erreur d'un champ disparaît dès que l'utilisateur le corrige.
    setFieldErrors((errs) => {
      if (!(key in errs)) return errs;
      const next = { ...errs };
      delete next[key as FieldKey];
      return next;
    });
  }

  /** Contrôles immédiats, avec le même libellé que le champ concerné. */
  function validate(): Partial<Record<FieldKey, string>> {
    const errs: Partial<Record<FieldKey, string>> = {};
    if (form.fullName.trim().length < 2) errs.fullName = 'Le nom complet doit contenir au moins 2 caractères.';
    if (!form.email.trim()) errs.email = "L'adresse email est obligatoire.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Adresse email invalide.';
    if (form.password.length < 8) errs.password = 'Le mot de passe doit contenir au moins 8 caractères.';
    if (form.accountType === 'BUSINESS') {
      if (form.organizationName.trim().length < 2) errs.organizationName = "Le nom de l'entreprise doit contenir au moins 2 caractères.";
      if (form.storeName.trim().length < 2) errs.storeName = 'Le nom de la boutique doit contenir au moins 2 caractères.';
    }
    return errs;
  }

  /**
   * Transforme `details` (renvoyés par l'API pour une erreur de validation) en
   * messages affichés sous les champs concernés.
   */
  function fieldErrorsFrom(err: ApiError): Partial<Record<FieldKey, string>> {
    const errs: Partial<Record<FieldKey, string>> = {};
    if (Array.isArray(err.details)) {
      for (const detail of err.details) {
        if (!detail || typeof detail !== 'object') continue;
        const path = String((detail as { path?: unknown }).path ?? '');
        const message = String((detail as { message?: unknown }).message ?? '');
        if (!message) continue;
        const key = path.split('.')[0] as FieldKey;
        if (FIELD_KEYS.includes(key)) errs[key] = fieldErrorText(key, message);
      }
    }
    // Email déjà utilisé : le message 409 est explicite, on le rattache au champ email.
    if (err.code === 'CONFLICT' && !errs.email) errs.email = withPeriod(err.message);
    return errs;
  }

  /**
   * Les messages d'erreur d'API sont autonomes (« Le mot de passe… ») ; sur le
   * champ, on évite la répétition du libellé quand il est déjà présent.
   */
  function fieldErrorText(key: FieldKey, message: string): string {
    const text = withPeriod(message);
    return message.toLowerCase().includes(FIELD_LABELS[key].toLowerCase()) ? text : `${FIELD_LABELS[key]} : ${text}`;
  }

  function withPeriod(message: string): string {
    return `${message.trim().replace(/\.+$/, '')}.`;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const localErrors = validate();
    setFieldErrors(localErrors);
    if (Object.keys(localErrors).length > 0) {
      setError('Inscription impossible : corrigez les champs signalés ci-dessous.');
      return;
    }
    setBusy(true);
    try {
      await register({
        accountType: form.accountType,
        email: form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
        // Les champs facultatifs vides ne sont pas envoyés (chaîne vide ≠ valeur).
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.accountType === 'BUSINESS'
          ? { organizationName: form.organizationName.trim(), storeName: form.storeName.trim() }
          : {}),
        ...(form.region ? { region: form.region } : {}),
        ...(form.city.trim() ? { city: form.city.trim() } : {}),
      });
      // Compte réellement créé : on redirige vers l'espace du compte choisi et on
      // affiche une confirmation de création.
      navigate(form.accountType === 'INDIVIDUAL' ? '/seller' : '/app', {
        state: { accountCreated: true, accountType: form.accountType },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(fieldErrorsFrom(err));
        setError(err.message);
      } else {
        setError("Inscription impossible : le compte n'a pas été créé. Réessayez dans un instant.");
      }
    } finally {
      setBusy(false);
    }
  }

  function fieldError(key: FieldKey) {
    const message = fieldErrors[key];
    if (!message) return null;
    return (
      <span className="field-error" id={`${key}-error`} role="alert">
        {message}
      </span>
    );
  }

  function invalid(key: FieldKey) {
    return fieldErrors[key] ? true : undefined;
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
                <input
                  id="fullName"
                  required
                  value={form.fullName}
                  aria-invalid={invalid('fullName')}
                  aria-describedby={fieldErrors.fullName ? 'fullName-error' : undefined}
                  onChange={(e) => update('fullName', e.target.value)}
                />
                {fieldError('fullName')}
              </div>
              <div className="field">
                <label htmlFor="phone">Téléphone (optionnel)</label>
                <input
                  id="phone"
                  value={form.phone}
                  aria-invalid={invalid('phone')}
                  aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
                  onChange={(e) => update('phone', e.target.value)}
                />
                {fieldError('phone')}
              </div>
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                aria-invalid={invalid('email')}
                aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                onChange={(e) => update('email', e.target.value)}
              />
              {fieldError('email')}
            </div>
            <div className="field">
              <label htmlFor="password">Mot de passe (8 caractères minimum)</label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={form.password}
                aria-invalid={invalid('password')}
                aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                onChange={(e) => update('password', e.target.value)}
              />
              {fieldError('password')}
            </div>

            {form.accountType === 'BUSINESS' && (
              <>
                <hr className="divider" />
                <div className="form-row">
                  <div className="field">
                    <label htmlFor="organizationName">Nom de l'entreprise</label>
                    <input
                      id="organizationName"
                      required
                      value={form.organizationName}
                      aria-invalid={invalid('organizationName')}
                      aria-describedby={fieldErrors.organizationName ? 'organizationName-error' : undefined}
                      onChange={(e) => update('organizationName', e.target.value)}
                    />
                    {fieldError('organizationName')}
                  </div>
                  <div className="field">
                    <label htmlFor="storeName">Nom de la boutique</label>
                    <input
                      id="storeName"
                      required
                      value={form.storeName}
                      aria-invalid={invalid('storeName')}
                      aria-describedby={fieldErrors.storeName ? 'storeName-error' : undefined}
                      onChange={(e) => update('storeName', e.target.value)}
                    />
                    {fieldError('storeName')}
                  </div>
                </div>
              </>
            )}
            <div className="form-row">
              <div className="field">
                <label htmlFor="region">Région</label>
                <select
                  id="region"
                  value={form.region}
                  aria-invalid={invalid('region')}
                  aria-describedby={fieldErrors.region ? 'region-error' : undefined}
                  onChange={(e) => update('region', e.target.value)}
                >
                  {SENEGAL_REGIONS.map((r) => (
                    <option key={r.code} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {fieldError('region')}
              </div>
              <div className="field">
                <label htmlFor="city">Ville (optionnel)</label>
                <input
                  id="city"
                  value={form.city}
                  aria-invalid={invalid('city')}
                  aria-describedby={fieldErrors.city ? 'city-error' : undefined}
                  onChange={(e) => update('city', e.target.value)}
                />
                {fieldError('city')}
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
