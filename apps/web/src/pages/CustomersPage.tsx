import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF } from '../lib/format';
import { Alert, Card, EmptyState, PageHead, Spinner } from '../components/ui';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

const EMPTY = { name: '', phone: '', email: '', address: '' };

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const { data, loading, error, reload } = useApi<{ customers: Customer[] }>(
    () => api.get(`/customers${query ? `?search=${encodeURIComponent(query)}` : ''}`),
    [query],
  );
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.name) {
      setFormError('Le nom est requis.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/customers', {
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
      });
      setForm(EMPTY);
      setShowForm(false);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Création impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title="Clients"
        subtitle="Fiches clients et historique d'achats."
        actions={
          <button className="btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Fermer' : '+ Nouveau client'}
          </button>
        }
      />

      {formError && <Alert kind="error">{formError}</Alert>}

      {showForm && (
        <Card title="Nouveau client">
          <form onSubmit={onCreate} noValidate>
            <div className="form-row">
              <div className="field">
                <label htmlFor="c-name">Nom</label>
                <input id="c-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="c-phone">Téléphone</label>
                <input id="c-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="c-address">Adresse</label>
              <input id="c-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        </Card>
      )}

      <Card
        title="Répertoire"
        actions={
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search);
            }}
          >
            <input aria-label="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom ou téléphone…" style={{ width: 180 }} />
            <button className="btn btn-secondary btn-sm" type="submit">
              OK
            </button>
          </form>
        }
      >
        {loading && <Spinner />}
        {error && <Alert kind="error">{error}</Alert>}
        {data && data.customers.length === 0 && <EmptyState title="Aucun client" hint="Ajoutez vos clients pour suivre les crédits et l'historique." />}
        {data && data.customers.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Téléphone</th>
                  <th>Adresse</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.phone ?? <span className="muted">—</span>}</td>
                    <td>{c.address ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="small muted" style={{ marginTop: 8 }}>
        Le solde de crédit de chaque client est visible sur sa fiche (API <code>/customers/:id</code>). Montants en {formatXOF(0).split(' ')[1]}.
      </p>
    </>
  );
}
