import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../context/AuthContext';
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

export function SettingsPage() {
  const { user, organizations, organizationId } = useAuth();
  const org = organizations.find((o) => o.id === organizationId);
  const caps = useApi<Capabilities>(() => api.get('/payments/capabilities', { publicRoute: true }), []);
  const subscription = useApi<Subscription>((() => api.get('/subscriptions/current')), []);

  return (
    <>
      <PageHead title="Paramètres" subtitle="Organisation, abonnement et moyens de paiement." />

      <Card title="Organisation">
        <dl className="stack">
          <div>
            <dt className="stat-label">Nom</dt>
            <dd style={{ margin: 0 }}>{org?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="stat-label">Identifiant (slug)</dt>
            <dd style={{ margin: 0 }} className="small muted">
              {org?.slug ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="stat-label">Mon rôle</dt>
            <dd style={{ margin: 0 }}>
              <span className="badge badge-primary">{org?.role ?? '—'}</span>
            </dd>
          </div>
          <div>
            <dt className="stat-label">Utilisateur connecté</dt>
            <dd style={{ margin: 0 }}>
              {user?.fullName} · <span className="small muted">{user?.email}</span>
            </dd>
          </div>
        </dl>
      </Card>

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
              Les limites sont appliquées côté serveur. Les fonctionnalités activées : {subscription.data.plan.features.join(', ')}.
            </p>
          </div>
        )}
      </Card>

      <Card title="Moyens de paiement">
        {caps.loading && <Spinner />}
        {caps.error && <Alert kind="error">{caps.error}</Alert>}
        {caps.data && (
          <>
            {!caps.data.onlinePaymentEnabled && (
              <Alert kind="warning">
                {caps.data.notice ?? "Les paiements en ligne ne sont pas connectés dans cette version."} L'encaissement en
                espèces et la vente à crédit restent disponibles.
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

      {organizations.length === 0 && <EmptyState title="Aucune organisation" hint="Votre compte n'est rattaché à aucune organisation." />}
    </>
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
