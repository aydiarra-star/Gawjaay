import { useMemo, useState } from 'react';
import { MANUAL_SETTLEMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@gawjaay/shared';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF } from '../lib/format';
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
  price: number;
  variants: Array<{ id: string; name: string; sku: string }>;
}

export function PosPage() {
  const { storeId } = useStore();
  const [search, setSearch] = useState('');
  const products = useApi<{ items: Product[] }>(() => api.get('/products?pageSize=100'), []);
  const stock = useApi<{ items: StockItem[] }>(
    () => api.get(`/inventory${storeId ? `?storeId=${storeId}` : ''}`),
    [storeId],
  );

  const [cart, setCart] = useState<Record<string, { variantId: string; name: string; price: number; quantity: number }>>({});
  const [customerId, setCustomerId] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');
  const [paidAmount, setPaidAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const customers = useApi<{ customers: Array<{ id: string; name: string }> }>(() => api.get('/customers'), []);

  const quantityByVariant = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of stock.data?.items ?? []) map.set(item.variantId, item.quantity);
    return map;
  }, [stock.data]);

  const lines = Object.values(cart);
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const paid = payMethod === 'CREDIT' ? Number(paidAmount || 0) : subtotal;
  const remaining = Math.max(0, subtotal - paid);

  const filtered = (products.data?.items ?? []).filter((p) =>
    search.trim() ? p.name.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  function addToCart(product: Product, variantId: string, variantName: string) {
    const available = quantityByVariant.get(variantId) ?? 0;
    const current = cart[variantId]?.quantity ?? 0;
    if (current + 1 > available) {
      setError(`Stock insuffisant pour « ${product.name} » (${available} disponible(s)).`);
      return;
    }
    setError(null);
    setCart((c) => ({
      ...c,
      [variantId]: {
        variantId,
        name: `${product.name} — ${variantName}`,
        price: product.price,
        quantity: current + 1,
      },
    }));
  }

  function removeLine(variantId: string) {
    setCart((c) => {
      const next = { ...c };
      delete next[variantId];
      return next;
    });
  }

  async function checkout() {
    setError(null);
    setSuccess(null);
    if (!storeId) {
      setError('Aucune boutique active.');
      return;
    }
    if (lines.length === 0) {
      setError('Le panier est vide.');
      return;
    }
    if (payMethod === 'CREDIT' && !customerId) {
      setError('Une vente à crédit nécessite un client identifié.');
      return;
    }
    setBusy(true);
    try {
      const payments =
        payMethod === 'CREDIT'
          ? paid > 0
            ? [{ method: 'CASH', amount: paid }]
            : []
          : [{ method: payMethod, amount: subtotal }];
      const res = await api.post<{ total: number; remaining: number }>('/sales', {
        storeId,
        customerId: customerId || undefined,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        payments,
      });
      setSuccess(`Vente enregistrée : ${formatXOF(res.total)}${res.remaining > 0 ? ` (reste dû ${formatXOF(res.remaining)})` : ''}.`);
      setCart({});
      setPaidAmount('');
      setCustomerId('');
      stock.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Vente impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Vente (POS)" subtitle="Encaissez rapidement. Les prix et le stock sont contrôlés par le serveur." />
      {error && <Alert kind="error">{error}</Alert>}
      {success && <Alert kind="success">{success}</Alert>}

      <div className="grid" style={{ gridTemplateColumns: '1fr', gap: 16 }}>
        <Card title="Produits">
          <div className="field">
            <label htmlFor="pos-search">Rechercher un produit</label>
            <input id="pos-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom du produit…" />
          </div>
          {products.loading && <Spinner />}
          {products.error && <Alert kind="error">{products.error}</Alert>}
          {products.data && filtered.length === 0 && <EmptyState title="Aucun produit" hint="Ajoutez des produits pour commencer à vendre." />}
          <div className="grid grid-cards">
            {filtered.map((p) => (
              <div className="card" key={p.id}>
                <h3>{p.name}</h3>
                <p className="muted small">{formatXOF(p.price)}</p>
                {p.variants.map((v) => (
                  <button
                    key={v.id}
                    className="btn btn-secondary btn-sm btn-block"
                    style={{ marginTop: 6 }}
                    onClick={() => addToCart(p, v.id, v.name)}
                  >
                    + {v.name} (stock {quantityByVariant.get(v.id) ?? 0})
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Card>

        <Card title={`Panier (${lines.length})`}>
          {lines.length === 0 ? (
            <EmptyState title="Panier vide" hint="Ajoutez des articles pour encaisser." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Article</th>
                    <th className="num">Qté</th>
                    <th className="num">Prix</th>
                    <th className="num">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.variantId}>
                      <td>{l.name}</td>
                      <td className="num">{l.quantity}</td>
                      <td className="num">{formatXOF(l.price)}</td>
                      <td className="num">{formatXOF(l.price * l.quantity)}</td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => removeLine(l.variantId)} aria-label={`Retirer ${l.name}`}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 16 }} className="stack">
            <div className="row between">
              <strong>Total</strong>
              <strong className="stat-value" style={{ fontSize: '1.3rem' }}>
                {formatXOF(subtotal)}
              </strong>
            </div>

            <div className="form-row">
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="pos-method">Moyen de paiement</label>
                <select id="pos-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                  {MANUAL_SETTLEMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {PAYMENT_METHOD_LABELS[method]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="pos-customer">Client {payMethod === 'CREDIT' ? '(requis)' : '(optionnel)'}</label>
                <select id="pos-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">— Aucun —</option>
                  {(customers.data?.customers ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {payMethod === 'CREDIT' && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="pos-paid">Montant encaissé maintenant</label>
                <input id="pos-paid" type="number" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder="0" />
                <p className="small muted" style={{ marginTop: 6 }}>
                  Reste dû : <strong>{formatXOF(remaining)}</strong>
                </p>
              </div>
            )}

            <button className="btn btn-block" onClick={checkout} disabled={busy || lines.length === 0}>
              {busy ? 'Enregistrement…' : 'Encaisser'}
            </button>
          </div>
        </Card>
      </div>
    </>
  );
}
