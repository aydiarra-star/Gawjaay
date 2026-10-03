import { useState } from 'react';
import { MANUAL_SETTLEMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@gawjaay/shared';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF, formatDate } from '../lib/format';
import { Alert, Card, EmptyState, PageHead, Spinner } from '../components/ui';
import { Modal } from '../components/product';

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

interface SalePayment {
  id: string;
  amount: number;
  method: string;
  status: string;
}

interface CustomerSale {
  id: string;
  total: number;
  createdAt: string;
  status: string;
  payments: SalePayment[];
}

interface CustomerDetail extends Customer {
  totalPurchases: number;
  balance: number;
  sales: CustomerSale[];
}

const EMPTY = { name: '', phone: '', email: '', address: '' };

/** Reste dû d'une vente = total − règlements réussis. */
function outstandingOf(sale: CustomerSale): number {
  const paid = sale.payments.filter((p) => p.status === 'SUCCESSFUL').reduce((s, p) => s + p.amount, 0);
  return Math.max(0, sale.total - paid);
}

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
        subtitle="Fiches clients, historique d'achats et solde de crédit."
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.phone ?? <span className="muted">—</span>}</td>
                    <td>{c.address ?? <span className="muted">—</span>}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setSelectedId(c.id)}>
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
        <CustomerDetailModal
          customerId={selectedId}
          onClose={() => setSelectedId(null)}
          onCollected={() => {
            reload();
          }}
        />
      )}
    </>
  );
}

function CustomerDetailModal({
  customerId,
  onClose,
  onCollected,
}: {
  customerId: string;
  onClose: () => void;
  onCollected: () => void;
}) {
  const { data, loading, error, reload } = useApi<{ customer: CustomerDetail }>(
    () => api.get(`/customers/${customerId}`),
    [customerId],
  );
  const [collectFor, setCollectFor] = useState<CustomerSale | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [busy, setBusy] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const customer = data?.customer;
  const lastSale = customer?.sales[0];

  function openCollect(sale: CustomerSale) {
    setCollectFor(sale);
    setAmount(String(outstandingOf(sale)));
    setMethod('CASH');
    setCollectError(null);
    setNotice(null);
  }

  async function submitCollect(e: React.FormEvent) {
    e.preventDefault();
    if (!collectFor) return;
    const value = Number(amount);
    const outstanding = outstandingOf(collectFor);
    if (!Number.isFinite(value) || value <= 0) {
      setCollectError('Indiquez un montant supérieur à zéro.');
      return;
    }
    if (value > outstanding) {
      setCollectError(`Le montant dépasse le reste dû (${formatXOF(outstanding)}).`);
      return;
    }
    setBusy(true);
    setCollectError(null);
    try {
      await api.post(`/sales/${collectFor.id}/payments`, { method, amount: value });
      setNotice(`Encaissement de ${formatXOF(value)} enregistré.`);
      setCollectFor(null);
      setAmount('');
      reload();
      onCollected();
    } catch (err) {
      setCollectError(err instanceof ApiError ? err.message : 'Encaissement impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={customer ? `Fiche client — ${customer.name}` : 'Fiche client'}
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

      {customer && (
        <>
          <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="kpi-tile plain">
              <div className="stat-label">Total acheté</div>
              <div className="stat-value">{formatXOF(customer.totalPurchases)}</div>
            </div>
            <div className="kpi-tile plain">
              <div className="stat-label">Solde dû</div>
              <div className="stat-value" style={customer.balance > 0 ? { color: 'var(--danger)' } : undefined}>
                {formatXOF(customer.balance)}
              </div>
            </div>
            <div className="kpi-tile plain">
              <div className="stat-label">Dernier achat</div>
              <div className="stat-value" style={{ fontSize: '1rem' }}>
                {lastSale ? formatDate(lastSale.createdAt) : '—'}
              </div>
            </div>
          </div>

          <p className="small muted" style={{ marginTop: 4 }}>
            {customer.phone ? `Téléphone : ${customer.phone}` : 'Téléphone non renseigné'}
            {customer.email ? ` · ${customer.email}` : ''}
            {customer.address ? ` · ${customer.address}` : ''}
          </p>

          <hr className="divider" />
          <h3 style={{ fontSize: '0.95rem' }}>Historique des achats</h3>
          {customer.sales.length === 0 ? (
            <EmptyState title="Aucun achat" hint="Ce client n'a pas encore acheté." />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="num">Total</th>
                    <th className="num">Reste dû</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {customer.sales.map((sale) => {
                    const due = outstandingOf(sale);
                    return (
                      <tr key={sale.id}>
                        <td>{formatDate(sale.createdAt)}</td>
                        <td className="num">{formatXOF(sale.total)}</td>
                        <td className="num">
                          {due > 0 ? <span className="badge badge-danger">{formatXOF(due)}</span> : <span className="muted">Soldé</span>}
                        </td>
                        <td>
                          {due > 0 && (
                            <button className="btn btn-secondary btn-sm" onClick={() => openCollect(sale)}>
                              Encaisser
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

          {collectFor && (
            <form onSubmit={submitCollect} noValidate style={{ marginTop: 12 }}>
              {collectError && <Alert kind="error">{collectError}</Alert>}
              <p className="small muted" style={{ marginTop: 0 }}>
                Encaissez un règlement sur la vente du {formatDate(collectFor.createdAt)} — reste dû{' '}
                {formatXOF(outstandingOf(collectFor))}.
              </p>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="col-amount">Montant (FCFA)</label>
                  <input id="col-amount" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="col-method">Moyen</label>
                  <select id="col-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
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
                <button type="button" className="btn btn-secondary" onClick={() => setCollectFor(null)} disabled={busy}>
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
