import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF, formatDate } from '../lib/format';
import { useStore } from '../context/StoreContext';
import { Alert, Card, EmptyState, PageHead, Spinner, StatusBadge } from '../components/ui';

interface Purchase {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  supplier: { id: string; name: string };
  items: Array<{ id: string; quantity: number; unitCost: number; variant: { name: string; product: { name: string } } }>;
}

interface Product {
  id: string;
  name: string;
  purchasePrice: number;
  variants: Array<{ id: string; name: string }>;
}
interface Supplier {
  id: string;
  name: string;
}

export function PurchasesPage() {
  const { storeId } = useStore();
  const purchases = useApi<{ purchases: Purchase[] }>(() => api.get('/purchases'), []);
  const suppliers = useApi<{ suppliers: Supplier[] }>(() => api.get('/suppliers'), []);
  const products = useApi<{ items: Product[] }>(() => api.get('/products?pageSize=100'), []);

  const [supplierId, setSupplierId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const allVariants = (products.data?.items ?? []).flatMap((p) =>
    p.variants.map((v) => ({ id: v.id, label: `${p.name} — ${v.name}`, cost: p.purchasePrice })),
  );

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!storeId || !supplierId || !variantId) {
      setError('Sélectionnez une boutique, un fournisseur et une variante.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/purchases', {
        storeId,
        supplierId,
        items: [{ variantId, quantity: Number(quantity || 1), unitCost: Number(unitCost || 0) }],
      });
      setQuantity('');
      setUnitCost('');
      purchases.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible');
    } finally {
      setBusy(false);
    }
  }

  async function receive(id: string) {
    setError(null);
    setBusyId(id);
    try {
      await api.post(`/purchases/${id}/receive`);
      purchases.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Réception impossible');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHead title="Achats" subtitle="Bons d'achat fournisseurs. Le stock n'augmente qu'à la réception." />

      <Card title="Nouvel achat">
        {error && <Alert kind="error">{error}</Alert>}
        <form onSubmit={onCreate} noValidate>
          <div className="form-row">
            <div className="field">
              <label htmlFor="a-supplier">Fournisseur</label>
              <select id="a-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— Sélectionner —</option>
                {(suppliers.data?.suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="a-variant">Produit / variante</label>
              <select
                id="a-variant"
                value={variantId}
                onChange={(e) => {
                  setVariantId(e.target.value);
                  const v = allVariants.find((x) => x.id === e.target.value);
                  if (v) setUnitCost(String(v.cost));
                }}
              >
                <option value="">— Sélectionner —</option>
                {allVariants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="a-qty">Quantité</label>
              <input id="a-qty" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="a-cost">Coût unitaire (FCFA)</label>
              <input id="a-cost" type="number" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </div>
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Enregistrement…' : "Créer l'achat"}
          </button>
        </form>
      </Card>

      <Card title="Historique">
        {purchases.loading && <Spinner />}
        {purchases.error && <Alert kind="error">{purchases.error}</Alert>}
        {purchases.data && purchases.data.purchases.length === 0 && <EmptyState title="Aucun achat" hint="Créez un bon d'achat puis réceptionnez-le." />}
        {purchases.data && purchases.data.purchases.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fournisseur</th>
                  <th>Date</th>
                  <th>Articles</th>
                  <th className="num">Total</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {purchases.data.purchases.map((p) => (
                  <tr key={p.id}>
                    <td>{p.supplier.name}</td>
                    <td>{formatDate(p.createdAt)}</td>
                    <td className="small muted">
                      {p.items.map((i) => `${i.quantity} × ${i.variant.product.name}`).join(', ')}
                    </td>
                    <td className="num">{formatXOF(p.total)}</td>
                    <td>
                      <StatusBadge status={p.status === 'RECEIVED' ? 'SUCCESSFUL' : 'PENDING'} label={p.status === 'RECEIVED' ? 'Reçu' : 'En attente'} />
                    </td>
                    <td>
                      {p.status !== 'RECEIVED' && p.status !== 'CANCELLED' && (
                        <button className="btn btn-secondary btn-sm" disabled={busyId === p.id} onClick={() => receive(p.id)}>
                          Réceptionner
                        </button>
                      )}
                    </td>
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
