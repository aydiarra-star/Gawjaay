import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { Alert, Card, EmptyState, PageHead, Spinner } from '../components/ui';

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

const EMPTY = { name: '', phone: '', email: '', address: '' };

export function SuppliersPage() {
  const { data, loading, error, reload } = useApi<{ suppliers: Supplier[] }>(() => api.get('/suppliers'), []);
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
      await api.post('/suppliers', {
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
        title="Fournisseurs"
        subtitle="Vos fournisseurs et leurs coordonnées."
        actions={
          <button className="btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Fermer' : '+ Nouveau fournisseur'}
          </button>
        }
      />

      {formError && <Alert kind="error">{formError}</Alert>}

      {showForm && (
        <Card title="Nouveau fournisseur">
          <form onSubmit={onCreate} noValidate>
            <div className="form-row">
              <div className="field">
                <label htmlFor="f-name">Nom</label>
                <input id="f-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="f-phone">Téléphone</label>
                <input id="f-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="f-address">Adresse</label>
              <input id="f-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        </Card>
      )}

      <Card title="Liste">
        {loading && <Spinner />}
        {error && <Alert kind="error">{error}</Alert>}
        {data && data.suppliers.length === 0 && <EmptyState title="Aucun fournisseur" hint="Ajoutez vos fournisseurs pour gérer les achats." />}
        {data && data.suppliers.length > 0 && (
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
                {data.suppliers.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.phone ?? <span className="muted">—</span>}</td>
                    <td>{s.address ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
