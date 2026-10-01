import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useStore } from '../context/StoreContext';
import { Alert, Card, EmptyState, PageHead, Spinner } from '../components/ui';

interface StockItem {
  storeId: string;
  storeName: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  quantity: number;
  threshold: number;
  low: boolean;
}

interface Product {
  id: string;
  name: string;
  variants: Array<{ id: string; name: string }>;
}

const MOVEMENTS = [
  { value: 'ENTRY', label: 'Entrée' },
  { value: 'EXIT', label: 'Sortie' },
  { value: 'ADJUSTMENT', label: 'Ajustement (+/-)' },
  { value: 'COUNT', label: 'Inventaire (valeur exacte)' },
];

export function StockPage() {
  const { storeId } = useStore();
  const stock = useApi<{ items: StockItem[] }>(
    () => api.get(`/inventory${storeId ? `?storeId=${storeId}` : ''}`),
    [storeId],
  );
  const products = useApi<{ items: Product[] }>(() => api.get('/products?pageSize=100'), []);

  const [variantId, setVariantId] = useState('');
  const [type, setType] = useState('ENTRY');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onAdjust(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!storeId || !variantId) {
      setError('Sélectionnez une variante.');
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty === 0) {
      setError('Indiquez une quantité non nulle.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ quantity: number }>('/inventory/adjust', { storeId, variantId, quantity: qty, type, note: note || undefined });
      setSuccess(`Stock mis à jour : nouvelle quantité ${res.quantity}.`);
      setQuantity('');
      setNote('');
      stock.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ajustement impossible');
    } finally {
      setBusy(false);
    }
  }

  const allVariants = (products.data?.items ?? []).flatMap((p) => p.variants.map((v) => ({ id: v.id, label: `${p.name} — ${v.name}` })));

  return (
    <>
      <PageHead title="Stock" subtitle="Entrées, sorties, ajustements et inventaire, historisés." />

      <Card title="Ajuster le stock">
        {error && <Alert kind="error">{error}</Alert>}
        {success && <Alert kind="success">{success}</Alert>}
        <form onSubmit={onAdjust} noValidate>
          <div className="field">
            <label htmlFor="s-variant">Variante</label>
            <select id="s-variant" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              <option value="">— Sélectionner —</option>
              {allVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="field">
              <label htmlFor="s-type">Type de mouvement</label>
              <select id="s-type" value={type} onChange={(e) => setType(e.target.value)}>
                {MOVEMENTS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="s-qty">Quantité</label>
              <input id="s-qty" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="s-note">Note (optionnel)</label>
            <input id="s-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Appliquer'}
          </button>
        </form>
      </Card>

      <Card title="État du stock">
        {stock.loading && <Spinner />}
        {stock.error && <Alert kind="error">{stock.error}</Alert>}
        {stock.data && stock.data.items.length === 0 && <EmptyState title="Aucun stock" hint="Enregistrez des entrées ou réceptionnez un achat." />}
        {stock.data && stock.data.items.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Variante</th>
                  <th>Boutique</th>
                  <th className="num">Quantité</th>
                  <th className="num">Seuil</th>
                </tr>
              </thead>
              <tbody>
                {stock.data.items.map((item) => (
                  <tr key={`${item.storeId}-${item.variantId}`}>
                    <td>{item.productName}</td>
                    <td>{item.variantName}</td>
                    <td>{item.storeName}</td>
                    <td className="num">
                      <span className={`badge ${item.low ? 'badge-danger' : ''}`}>{item.quantity}</span>
                    </td>
                    <td className="num">{item.threshold}</td>
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
