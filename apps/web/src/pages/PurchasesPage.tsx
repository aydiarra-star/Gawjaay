import { useState } from 'react';
import { MANUAL_SETTLEMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@gawjaay/shared';
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
  supplier: { id: string; name: string } | null;
  items: Array<{ id: string; quantity: number; unitCost: number; variant: { name: string; product: { name: string } } }>;
  payments: Array<{ id: string; amount: number; method: string; status: string }>;
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

interface DraftLine {
  key: number;
  variantId: string;
  quantity: string;
  unitCost: string;
}

let lineKey = 0;
function newLine(): DraftLine {
  lineKey += 1;
  return { key: lineKey, variantId: '', quantity: '1', unitCost: '' };
}

function dueOf(purchase: Purchase): number {
  const paid = purchase.payments.filter((p) => p.status === 'SUCCESSFUL').reduce((s, p) => s + p.amount, 0);
  return Math.max(0, purchase.total - paid);
}

export function PurchasesPage() {
  const { storeId } = useStore();
  const purchases = useApi<{ purchases: Purchase[] }>(() => api.get('/purchases'), []);
  const suppliers = useApi<{ suppliers: Supplier[] }>(() => api.get('/suppliers'), []);
  const products = useApi<{ items: Product[] }>(() => api.get('/products?pageSize=100'), []);

  const [supplierId, setSupplierId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const allVariants = (products.data?.items ?? []).flatMap((p) =>
    p.variants.map((v) => ({ id: v.id, label: `${p.name} — ${v.name}`, cost: p.purchasePrice })),
  );

  const total = lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unitCost || 0), 0);

  function updateLine(key: number, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function resetForm() {
    setLines([newLine()]);
    setSupplierId('');
    setPaymentMethod('');
    setPaymentAmount('');
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!storeId) {
      setError('Aucune boutique active.');
      return;
    }
    const items = lines
      .filter((l) => l.variantId)
      .map((l) => ({ variantId: l.variantId, quantity: Number(l.quantity || 0), unitCost: Number(l.unitCost || 0) }));
    if (items.length === 0) {
      setError('Ajoutez au moins un article.');
      return;
    }
    if (items.some((i) => i.quantity <= 0)) {
      setError('Chaque quantité doit être supérieure à zéro.');
      return;
    }
    const paid = paymentMethod ? Number(paymentAmount || 0) : 0;
    setBusy(true);
    try {
      await api.post('/purchases', {
        storeId,
        supplierId: supplierId || undefined,
        items,
        ...(paymentMethod && paid > 0 ? { payment: { method: paymentMethod, amount: paid } } : {}),
      });
      setSuccess('Achat enregistré. Réceptionnez-le pour augmenter le stock.');
      resetForm();
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
        {success && <Alert kind="success">{success}</Alert>}
        <form onSubmit={onCreate} noValidate>
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

          <h3 style={{ fontSize: '0.95rem', marginTop: 6 }}>Articles</h3>
          {lines.map((l) => (
            <div className="form-row" key={l.key} style={{ alignItems: 'end' }}>
              <div className="field" style={{ flex: 3 }}>
                <label>Produit / variante</label>
                <select
                  value={l.variantId}
                  onChange={(e) => {
                    const v = allVariants.find((x) => x.id === e.target.value);
                    updateLine(l.key, { variantId: e.target.value, unitCost: v ? String(v.cost) : l.unitCost });
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
              <div className="field">
                <label>Quantité</label>
                <input type="number" min="1" value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} />
              </div>
              <div className="field">
                <label>Coût unitaire</label>
                <input type="number" min="0" value={l.unitCost} onChange={(e) => updateLine(l.key, { unitCost: e.target.value })} />
              </div>
              <div className="field" style={{ flex: 'none' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
                  disabled={lines.length === 1}
                  aria-label="Retirer la ligne"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLines((ls) => [...ls, newLine()])}>
            + Ajouter une ligne
          </button>

          <div className="row between" style={{ marginTop: 16 }}>
            <strong>Total</strong>
            <strong className="stat-value" style={{ fontSize: '1.2rem' }}>
              {formatXOF(total)}
            </strong>
          </div>

          <h3 style={{ fontSize: '0.95rem' }}>Règlement immédiat (optionnel)</h3>
          <div className="form-row">
            <div className="field">
              <label htmlFor="a-pay-method">Moyen</label>
              <select
                id="a-pay-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | '')}
              >
                <option value="">— Aucun (tout à crédit) —</option>
                {MANUAL_SETTLEMENT_METHODS.filter((m) => m !== 'CREDIT').map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="a-pay-amount">Montant payé (FCFA)</label>
              <input
                id="a-pay-amount"
                type="number"
                min="0"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                disabled={!paymentMethod}
                placeholder={paymentMethod ? String(total) : '—'}
              />
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
                  <th className="num">Reste dû</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {purchases.data.purchases.map((p) => {
                  const due = dueOf(p);
                  return (
                    <tr key={p.id}>
                      <td>{p.supplier?.name ?? <span className="muted">—</span>}</td>
                      <td>{formatDate(p.createdAt)}</td>
                      <td className="small muted">
                        {p.items.map((i) => `${i.quantity} × ${i.variant.product.name}`).join(', ')}
                      </td>
                      <td className="num">{formatXOF(p.total)}</td>
                      <td className="num">
                        {due > 0 ? <span className="badge badge-danger">{formatXOF(due)}</span> : <span className="muted">Soldé</span>}
                      </td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
