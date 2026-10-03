import { useState } from 'react';
import { SENEGAL_REGIONS } from '@gawjaay/shared';
import { api, apiRequest, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { Alert, Card, EmptyState, PageHead, Spinner } from '../components/ui';

interface Capabilities {
  onlinePaymentEnabled: boolean;
  methods: Array<{ method: string; label: string; available: boolean }>;
  notice: string | null;
}

interface Subscription {
  plan: { code: string; maxStores: number | null; maxProducts: number | null; maxUsers: number | null; features: string[] };
  usage: { stores: number; products: number; users: number };
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  activity: string | null;
}

interface Store {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  isPublic: boolean;
  isActive: boolean;
}

export function SettingsPage() {
  const { user, organizations, organizationId, refreshOrganizations } = useAuth();
  const { stores, storeId, setStoreId, refreshStores } = useStore();
  const org = organizations.find((o) => o.id === organizationId);

  const orgData = useApi<{ organization: Organization }>(() => api.get('/organizations/current'), [organizationId]);
  const storeData = useApi<{ stores: Store[] }>(() => api.get('/stores'), [organizationId]);
  const phone = useApi<{ phone: string | null; phoneVerified: boolean }>(() => api.get('/me/phone'), []);
  const caps = useApi<Capabilities>(() => api.get('/payments/capabilities', { publicRoute: true }), []);
  const subscription = useApi<Subscription>(() => api.get('/subscriptions/current'), []);

  return (
    <>
      <PageHead title="Paramètres" subtitle="Profil, boutiques, abonnement et moyens de paiement." />

      <OrganizationProfile
        org={orgData}
        onSaved={() => {
          orgData.reload();
          refreshOrganizations();
        }}
      />
      <StoresSection
        stores={storeData}
        storesCtx={stores}
        activeId={storeId}
        onSelect={setStoreId}
        onChanged={() => {
          storeData.reload();
          refreshStores();
        }}
      />
      <PhoneSection phone={phone} />
      <MembersSection />
      <ExportsSection />
      <ProfileReadOnly user={user} org={org} />
      <SubscriptionSection subscription={subscription} />
      <PaymentsSection caps={caps} />

      {organizations.length === 0 && <EmptyState title="Aucune organisation" hint="Votre compte n'est rattaché à aucune organisation." />}
    </>
  );
}

function OrganizationProfile({ org, onSaved }: { org: ReturnType<typeof useApi<{ organization: Organization }>>; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<Organization> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const current = form ?? org.data?.organization ?? null;
  if (org.loading) return <Card title="Profil marchand"><Spinner /></Card>;
  if (!current) return null;

  function set<K extends keyof Organization>(k: K, v: Organization[K]) {
    setForm({ ...(form ?? org.data!.organization), [k]: v });
    setOk(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.patch('/organizations/current', {
        name: current!.name,
        description: current!.description ?? undefined,
        phone: current!.phone ?? undefined,
        whatsapp: current!.whatsapp ?? undefined,
        email: current!.email ?? undefined,
        address: current!.address ?? undefined,
        city: current!.city ?? undefined,
        region: current!.region ?? undefined,
        activity: current!.activity ?? undefined,
      });
      setOk(true);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Profil marchand" actions={ok ? <span className="badge badge-success">Enregistré</span> : undefined}>
      <p className="small muted" style={{ marginTop: 0 }}>
        Ces informations sont publiques lorsque votre boutique est publiée. GawJaay n'affiche aucune donnée non fournie
        et <strong>n'attribue aucune certification</strong> automatique.
      </p>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="field">
        <label htmlFor="o-name">Nom commercial</label>
        <input id="o-name" value={current.name} onChange={(e) => set('name', e.target.value)} />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="o-phone">Téléphone</label>
          <input id="o-phone" value={current.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+221…" />
        </div>
        <div className="field">
          <label htmlFor="o-wa">WhatsApp (optionnel)</label>
          <input id="o-wa" value={current.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+221…" />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="o-city">Ville</label>
          <input id="o-city" value={current.city ?? ''} onChange={(e) => set('city', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="o-region">Région</label>
          <select id="o-region" value={current.region ?? ''} onChange={(e) => set('region', e.target.value)}>
            <option value="">—</option>
            {SENEGAL_REGIONS.map((r) => (
              <option key={r.code} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="o-address">Adresse (optionnel)</label>
        <input id="o-address" value={current.address ?? ''} onChange={(e) => set('address', e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="o-activity">Activité</label>
        <input id="o-activity" value={current.activity ?? ''} onChange={(e) => set('activity', e.target.value)} placeholder="Ex. Alimentation générale" />
      </div>
      <div className="field">
        <label htmlFor="o-desc">Description</label>
        <textarea id="o-desc" rows={3} value={current.description ?? ''} onChange={(e) => set('description', e.target.value)} />
      </div>
      <button className="btn" onClick={save} disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer le profil'}
      </button>
    </Card>
  );
}

function StoresSection({
  stores,
  activeId,
  onSelect,
  onChanged,
}: {
  stores: ReturnType<typeof useApi<{ stores: Store[] }>>;
  storesCtx: Array<{ id: string; name: string }>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function togglePublic(store: Store) {
    setError(null);
    try {
      await api.patch(`/stores/${store.id}`, { isPublic: !store.isPublic });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Mise à jour impossible');
    }
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/stores', { name: name.trim(), city: city.trim() || undefined, isPublic: false });
      setName('');
      setCity('');
      setCreating(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Mes boutiques" actions={<button className="btn btn-secondary btn-sm" onClick={() => setCreating((v) => !v)}>+ Nouvelle boutique</button>}>
      {error && <Alert kind="error">{error}</Alert>}
      {stores.loading && <Spinner />}
      {stores.data && (
        <div className="stack">
          {stores.data.stores.map((s) => (
            <div className="card" key={s.id} style={{ padding: 14 }}>
              <div className="row between">
                <div>
                  <strong>{s.name}</strong>
                  {activeId === s.id && <span className="badge badge-primary" style={{ marginLeft: 8 }}>Active</span>}
                  <div className="small muted">{[s.city, s.region].filter(Boolean).join(', ') || '—'}</div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => onSelect(s.id)} disabled={activeId === s.id}>
                  {activeId === s.id ? 'Sélectionnée' : 'Rendre active'}
                </button>
              </div>
              <div className="row between" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                <span className="small muted">
                  Boutique publique : {s.isPublic ? <span className="badge badge-success">Publiée</span> : <span className="badge">Privée</span>}
                </span>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => togglePublic(s)}>
                    {s.isPublic ? 'Dépublier' : 'Publier'}
                  </button>
                  {s.isPublic && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => window.open(`${window.location.origin}${import.meta.env.BASE_URL}shop/${s.slug}`, '_blank', 'noopener')}
                    >
                      Voir
                    </button>
                  )}
                  {s.isPublic && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}${import.meta.env.BASE_URL}shop/${s.slug}`)}
                    >
                      Copier l'URL
                    </button>
                  )}
                </div>
              </div>
              {s.isPublic && (
                <p className="small muted" style={{ marginBottom: 0, marginTop: 8 }}>
                  URL publique : {window.location.origin}
                  {import.meta.env.BASE_URL}shop/{s.slug}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {creating && (
        <div className="card" style={{ padding: 14, marginTop: 12 }}>
          <div className="field">
            <label htmlFor="ns-name">Nom de la boutique</label>
            <input id="ns-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ns-city">Ville (optionnel)</label>
            <input id="ns-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <button className="btn" onClick={create} disabled={busy || name.trim().length < 2}>
            {busy ? 'Création…' : 'Créer la boutique'}
          </button>
        </div>
      )}
    </Card>
  );
}

function PhoneSection({ phone }: { phone: ReturnType<typeof useApi<{ phone: string | null; phoneVerified: boolean }>> }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function request() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ delivered: boolean; notice: string }>('/me/phone/request', {
        phone: phone.data?.phone ?? '',
      });
      setMsg(res.notice);
    } catch (err) {
      setMsg(err instanceof ApiError ? err.message : 'Demande impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Téléphone">
      {phone.loading && <Spinner />}
      {phone.data && (
        <>
          <p style={{ marginTop: 0 }}>
            Statut :{' '}
            {phone.data.phoneVerified ? (
              <span className="badge badge-success">Vérifié</span>
            ) : (
              <span className="badge badge-warning">Non vérifié</span>
            )}
          </p>
          <p className="small muted">
            La vérification par code n'est pas encore connectée à un fournisseur SMS. Tant qu'aucun code réel n'est
            validé, le numéro reste <strong>non vérifié</strong> : aucune fausse certification n'est affichée.
          </p>
          {msg && <Alert kind="info">{msg}</Alert>}
          <button className="btn btn-secondary btn-sm" onClick={request} disabled={busy}>
            Demander un code de vérification
          </button>
        </>
      )}
    </Card>
  );
}

interface Member {
  membershipId: string;
  role: string;
  isActive: boolean;
  permissions: string[] | null;
  user: { id: string; email: string; fullName: string; phone: string | null; isActive: boolean };
}

const ORG_ROLES = ['ADMIN', 'MANAGER', 'VENDEUR', 'STOCK'] as const;

function MembersSection() {
  const members = useApi<{ members: Member[] }>(() => api.get('/users'), []);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: '', fullName: '', password: '', role: 'VENDEUR' as (typeof ORG_ROLES)[number] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/users', { email: form.email.trim(), fullName: form.fullName.trim(), password: form.password, role: form.role });
      setForm({ email: '', fullName: '', password: '', role: 'VENDEUR' });
      setCreating(false);
      members.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ajout impossible');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(m: Member, role: string) {
    setError(null);
    try {
      await api.patch(`/users/${m.membershipId}`, { role });
      members.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Modification impossible');
    }
  }

  async function toggleActive(m: Member) {
    setError(null);
    try {
      await api.patch(`/users/${m.membershipId}`, { isActive: !m.isActive });
      members.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Modification impossible');
    }
  }

  return (
    <Card title="Membres" actions={<button className="btn btn-secondary btn-sm" onClick={() => setCreating((v) => !v)}>+ Ajouter un membre</button>}>
      {error && <Alert kind="error">{error}</Alert>}
      {members.loading && <Spinner />}
      {members.error && <Alert kind="error">{members.error}</Alert>}
      {members.data && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Membre</th>
                <th>Rôle</th>
                <th>Accès</th>
              </tr>
            </thead>
            <tbody>
              {members.data.members.map((m) => (
                <tr key={m.membershipId}>
                  <td>
                    <div>{m.user.fullName}</div>
                    <div className="small muted">{m.user.email}</div>
                  </td>
                  <td>
                    {m.role === 'OWNER' ? (
                      <span className="badge badge-primary">Propriétaire</span>
                    ) : (
                      <select value={m.role} onChange={(e) => changeRole(m, e.target.value)} style={{ width: 'auto' }}>
                        {ORG_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>
                    {m.role === 'OWNER' ? (
                      <span className="badge badge-success">Actif</span>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(m)}>
                        {m.isActive ? 'Désactiver' : 'Réactiver'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted" style={{ marginBottom: 0 }}>
        Rôles : propriétaire (tous droits), administrateur, gestionnaire, vendeur, stock. Les permissions sont vérifiées
        côté serveur, jamais dans le navigateur.
      </p>
      {creating && (
        <div className="card" style={{ padding: 14, marginTop: 12 }}>
          <div className="field">
            <label htmlFor="m-name">Nom complet</label>
            <input id="m-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="m-email">Email</label>
            <input id="m-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="m-password">Mot de passe provisoire</label>
              <input id="m-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="m-role">Rôle</label>
              <select id="m-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as (typeof ORG_ROLES)[number] })}>
                {ORG_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn" onClick={add} disabled={busy || !form.email || form.password.length < 8}>
            {busy ? 'Ajout…' : 'Ajouter le membre'}
          </button>
        </div>
      )}
    </Card>
  );
}

function ExportsSection() {
  const [busy, setBusy] = useState<string | null>(null);

  function download(kind: string) {
    setBusy(kind);
    void apiRequest<Blob>(`/exports/${kind}.csv`, { blob: true })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gawjaay-${kind}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .finally(() => setBusy(null));
  }

  const exports: Array<{ kind: string; label: string }> = [
    { kind: 'sales', label: 'Ventes' },
    { kind: 'stock', label: 'Stock' },
    { kind: 'customers', label: 'Clients' },
    { kind: 'purchases', label: 'Achats' },
  ];

  return (
    <Card title="Exports CSV">
      <p className="small muted" style={{ marginTop: 0 }}>Vos données réelles uniquement (aucune autre organisation).</p>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {exports.map((e) => (
          <button key={e.kind} className="btn btn-secondary btn-sm" onClick={() => download(e.kind)} disabled={busy === e.kind}>
            {busy === e.kind ? '…' : e.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

function ProfileReadOnly({ user, org }: { user: { fullName: string; email: string } | null; org?: { name?: string; slug?: string; role?: string } }) {
  return (
    <Card title="Compte">
      <dl className="stack">
        <div>
          <dt className="stat-label">Utilisateur connecté</dt>
          <dd style={{ margin: 0 }}>
            {user?.fullName} · <span className="small muted">{user?.email}</span>
          </dd>
        </div>
        <div>
          <dt className="stat-label">Mon rôle</dt>
          <dd style={{ margin: 0 }}>
            <span className="badge badge-primary">{org?.role ?? '—'}</span>
          </dd>
        </div>
        <div>
          <dt className="stat-label">Identifiant (slug)</dt>
          <dd style={{ margin: 0 }} className="small muted">{org?.slug ?? '—'}</dd>
        </div>
      </dl>
    </Card>
  );
}

function SubscriptionSection({ subscription }: { subscription: ReturnType<typeof useApi<Subscription>> }) {
  return (
    <Card title="Abonnement">
      {subscription.loading && <Spinner />}
      {subscription.error && <Alert kind="error">{subscription.error}</Alert>}
      {subscription.data && (
        <div className="stack">
          <p>
            Plan actuel : <span className="badge badge-primary">{subscription.data.plan.code}</span>
          </p>
          <div className="grid grid-stats">
            <Usage label="Boutiques" used={subscription.data.usage.stores} limit={subscription.data.plan.maxStores} />
            <Usage label="Produits" used={subscription.data.usage.products} limit={subscription.data.plan.maxProducts} />
            <Usage label="Utilisateurs" used={subscription.data.usage.users} limit={subscription.data.plan.maxUsers} />
          </div>
          <p className="small muted">
            Les limites sont appliquées côté serveur. Fonctionnalités activées : {subscription.data.plan.features.join(', ')}.
          </p>
        </div>
      )}
    </Card>
  );
}

function PaymentsSection({ caps }: { caps: ReturnType<typeof useApi<Capabilities>> }) {
  return (
    <Card title="Moyens de paiement">
      {caps.loading && <Spinner />}
      {caps.error && <Alert kind="error">{caps.error}</Alert>}
      {caps.data && (
        <>
          {!caps.data.onlinePaymentEnabled && (
            <Alert kind="warning">
              {caps.data.notice ?? 'Les paiements en ligne ne sont pas connectés dans cette version.'} L'encaissement en espèces
              et la vente à crédit restent disponibles.
            </Alert>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Moyen</th>
                  <th>Disponibilité</th>
                </tr>
              </thead>
              <tbody>
                {caps.data.methods.map((m) => (
                  <tr key={m.method}>
                    <td>{m.label}</td>
                    <td>
                      {m.available ? <span className="badge badge-success">Disponible</span> : <span className="badge">Non connecté</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {used}
        {limit !== null && <span className="muted small"> / {limit}</span>}
      </div>
    </div>
  );
}
