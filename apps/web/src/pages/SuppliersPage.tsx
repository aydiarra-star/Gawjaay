import { useState } from 'react';
import { MANUAL_SETTLEMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@gawjaay/shared';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF, formatDate } from '../lib/format';
import { Alert, Card, EmptyState, PageHead, Spinner } from '../components/ui';
import { Modal } from '../components/product';

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

interface PurchasePayment {
  id: string;
  amount: number;
  method: string;
  status: string;
}

interface SupplierPurchase {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  payments: PurchasePayment[];
  items: Array<{ id: string; quantity: number; unitCost: number; variant: { product: { name: string } } }>;
}

interface SupplierDetail extends Supplier {
  totalPurchased: number;
  debt: number;
  lastPurchaseAt: string | null;
  purchases: SupplierPurchase[];
}

const EMPTY = { name: '', phone: '', email: '', address: '' };

/** Reste dû d'un achat = total − règlements réussis. */
function dueOf(purchase: SupplierPurchase): number {
  const paid = purchase.payments.filter((p) => p.status === 'SUCCESSFUL').reduce((s, p) => s + p.amount, 0);
  return Math.max(0, purchase.total - paid);
}

export function SuppliersPage() {
  const { data, loading, error, reload } = useApi<{ suppliers: Supplier[] }>(() => api.get('/suppliers'), []);
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        subtitle="Vos fournisseurs, leurs achats et les dettes à régler."
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.suppliers.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.phone ?? <span className="muted">—</span>}</td>
                    <td>{s.address ?? <span className="muted">—</span>}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setSelectedId(s.id)}>
                        Voir la fiche
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedId && (
        <SupplierDetailModal
          supplierId={selectedId}
          onClose={() => setSelectedId(null)}
          onPaid={() => reload()}
        />
      )}
    </>
  );
}

function SupplierDetailModal({
  supplierId,
  onClose,
  onPaid,
}: {
  supplierId: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const { data, loading, error, reload } = useApi<{ supplier: SupplierDetail }>(
    () => api.get(`/suppliers/${supplierId}`),
    [supplierId],
  );
  const [payFor, setPayFor] = useState<SupplierPurchase | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const supplier = data?.supplier;

  function openPay(purchase: SupplierPurchase) {
    setPayFor(purchase);
    setAmount(String(dueOf(purchase)));
    setMethod('CASH');
    setPayError(null);
    setNotice(null);
  }

  async function submitPay(e: React.FormEvent) {
    e.preventDefault();
    if (!payFor) return;
    const value = Number(amount);
    const due = dueOf(payFor);
    if (!Number.isFinite(value) || value <= 0) {
      setPayError('Indiquez un montant supérieur à zéro.');
      return;
    }
    if (value > due) {
      setPayError(`Le montant dépasse la dette (${formatXOF(due)}).`);
      return;
    }
    setBusy(true);
    setPayError(null);
    try {
      await api.post(`/purchases/${payFor.id}/payments`, { method, amount: value });
      setNotice(`Règlement de ${formatXOF(value)} enregistré.`);
      setPayFor(null);
      setAmount('');
      reload();
      onPaid();
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : 'Règlement impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={supplier ? `Fiche fournisseur — ${supplier.name}` : 'Fiche fournisseur'}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Fermer
        </button>
      }
    >
      {loading && <Spinner label="Chargement de la fiche…" />}
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      {supplier && (
        <>
          <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="kpi-tile plain">
              <div className="stat-label">Total acheté</div>
              <div className="stat-value">{formatXOF(supplier.totalPurchased)}</div>
            </div>
            <div className="kpi-tile plain">
              <div className="stat-label">Montant dû</div>
              <div className="stat-value" style={supplier.debt > 0 ? { color: 'var(--danger)' } : undefined}>
                {formatXOF(supplier.debt)}
              </div>
            </div>
            <div className="kpi-tile plain">
              <div className="stat-label">Dernier achat</div>
              <div className="stat-value" style={{ fontSize: '1rem' }}>
                {supplier.lastPurchaseAt ? formatDate(supplier.lastPurchaseAt) : '—'}
              </div>
            </div>
          </div>

          {supplier.phone && <p className="small muted" style={{ marginTop: 4 }}>Téléphone : {supplier.phone}</p>}

          <hr className="divider" />
          <h3 style={{ fontSize: '0.95rem' }}>Historique des achats</h3>
          {supplier.purchases.length === 0 ? (
            <EmptyState title="Aucun achat" hint="Les achats auprès de ce fournisseur apparaîtront ici." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Articles</th>
                    <th className="num">Total</th>
                    <th className="num">Reste dû</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {supplier.purchases.map((p) => {
                    const due = dueOf(p);
                    return (
                      <tr key={p.id}>
                        <td>{formatDate(p.createdAt)}</td>
                        <td className="small muted">
                          {p.items.map((i) => `${i.quantity} × ${i.variant.product.name}`).join(', ')}
                        </td>
                        <td className="num">{formatXOF(p.total)}</td>
                        <td className="num">
                          {due > 0 ? <span className="badge badge-danger">{formatXOF(due)}</span> : <span className="muted">Soldé</span>}
                        </td>
                        <td>
                          {due > 0 && p.status === 'RECEIVED' && (
                            <button className="btn btn-secondary btn-sm" onClick={() => openPay(p)}>
                              Payer
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

          {payFor && (
            <form onSubmit={submitPay} noValidate style={{ marginTop: 12 }}>
              {payError && <Alert kind="error">{payError}</Alert>}
              <p className="small muted" style={{ marginTop: 0 }}>
                Réglez la dette de l'achat du {formatDate(payFor.createdAt)} — reste dû {formatXOF(dueOf(payFor))}.
              </p>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="pay-amount">Montant (FCFA)</label>
                  <input id="pay-amount" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="pay-method">Moyen</label>
                  <select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                    {MANUAL_SETTLEMENT_METHODS.filter((m) => m !== 'CREDIT').map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row">
                <button className="btn" type="submit" disabled={busy}>
                  {busy ? 'Enregistrement…' : 'Enregistrer le règlement'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setPayFor(null)} disabled={busy}>
                  Annuler
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
