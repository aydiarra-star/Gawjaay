import { useMemo, useState } from 'react';
import { type PackagingType } from '@gawjaay/shared';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF, formatDateTime, formatPackaging } from '../lib/format';
import { useStore } from '../context/StoreContext';
import { Alert, Card, Chips, EmptyState, PageHead, Spinner, Stat } from '../components/ui';

interface SalePayment {
  id: string;
  amount: number;
  method: string;
  status: string;
}

interface Sale {
  id: string;
  total: number;
  createdAt: string;
  status: string;
  customer: { id: string; name: string } | null;
  items: Array<{ id: string; name: string; quantity: number }>;
  payments: SalePayment[];
}

interface Movement {
  id: string;
  createdAt: string;
  type: string;
  quantity: number;
  productName: string;
  packaging: PackagingType;
}

const MOVEMENT_LABELS: Record<string, string> = {
  ENTRY: 'Entrée de stock',
  EXIT: 'Sortie',
  SALE: 'Vente',
  ONLINE_ORDER: 'Commande en ligne',
  RETURN: 'Retour',
  TRANSFER_IN: 'Transfert entrant',
  TRANSFER_OUT: 'Transfert sortant',
  ADJUSTMENT: 'Ajustement',
  COUNT: 'Inventaire',
  INITIAL: 'Stock initial',
};

type Range = 'today' | '7d' | '30d';

const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'today', label: "Aujourd'hui" },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
];

function sinceOf(range: Range): number {
  const now = new Date();
  if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (range === '7d') return Date.now() - 7 * 864e5;
  return Date.now() - 30 * 864e5;
}

export function HistoryPage() {
  const { storeId } = useStore();
  const [range, setRange] = useState<Range>('today');
  const [busyRefund, setBusyRefund] = useState<string | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);
  const sales = useApi<{ sales: Sale[] }>(() => api.get(`/sales${storeId ? `?storeId=${storeId}` : ''}`), [storeId]);
  const movements = useApi<{ movements: Movement[] }>(
    () => api.get(`/inventory/movements${storeId ? `?storeId=${storeId}` : ''}`),
    [storeId],
  );

  const since = sinceOf(range);

  const filteredSales = useMemo(
    () => (sales.data?.sales ?? []).filter((s) => new Date(s.createdAt).getTime() >= since),
    [sales.data, since],
  );
  const filteredMovements = useMemo(
    () => (movements.data?.movements ?? []).filter((m) => new Date(m.createdAt).getTime() >= since),
    [movements.data, since],
  );

  const revenue = filteredSales.reduce((s, x) => s + x.total, 0);
  const encaisse = filteredSales.reduce(
    (sum, sale) => sum + sale.payments.filter((p) => p.status === 'SUCCESSFUL').reduce((s, p) => s + p.amount, 0),
    0,
  );
  const credit = Math.max(0, revenue - encaisse);

  async function refund(saleId: string) {
    setRefundError(null);
    setBusyRefund(saleId);
    try {
      await api.post(`/sales/${saleId}/refund`, {});
      sales.reload();
      movements.reload();
    } catch (err) {
      setRefundError(err instanceof ApiError ? err.message : 'Remboursement impossible');
    } finally {
      setBusyRefund(null);
    }
  }

  return (
    <>
      <PageHead
        title="Historique"
        subtitle="Toutes les opérations de la boutique — ventes et mouvements de stock."
        actions={<Chips options={RANGES} value={range} onChange={(v) => v && setRange(v)} />}
      />

      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Stat label="Chiffre d'affaires" value={formatXOF(revenue)} hint={`${filteredSales.length} vente(s)`} />
        <Stat label="Encaissé" value={formatXOF(encaisse)} tone="positive" />
        <Stat label="Crédit accordé" value={formatXOF(credit)} tone={credit > 0 ? 'negative' : 'muted'} />
      </div>

      <Card title="Ventes">
        {refundError && <Alert kind="error">{refundError}</Alert>}
        {sales.loading && <Spinner />}
        {sales.error && <Alert kind="error">{sales.error}</Alert>}
        {sales.data && filteredSales.length === 0 && (
          <EmptyState title="Aucune vente sur la période" hint="Les ventes encaissées apparaîtront ici." />
        )}
        {filteredSales.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Articles</th>
                  <th>Client</th>
                  <th>Paiement</th>
                  <th className="num">Total</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => (
                  <tr key={sale.id}>
                    <td className="muted small">{formatDateTime(sale.createdAt)}</td>
                    <td>{sale.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</td>
                    <td className="muted">{sale.customer?.name ?? '—'}</td>
                    <td className="muted small">
                      {sale.payments.map((p) => p.method).join(', ') || '—'}
                    </td>
                    <td className="num" style={{ fontWeight: 620 }}>
                      {formatXOF(sale.total)}
                    </td>
                    <td>
                      {sale.status === 'REFUNDED' ? (
                        <span className="badge badge-warning">Remboursée</span>
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={busyRefund === sale.id}
                          onClick={() => refund(sale.id)}
                        >
                          {busyRefund === sale.id ? '…' : 'Rembourser'}
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

      <Card title="Mouvements de stock">
        <p className="small muted" style={{ marginTop: 0 }}>
          Entrées, ventes et ajustements — une trace par mouvement.
        </p>
        {movements.loading && <Spinner />}
        {movements.error && <Alert kind="error">{movements.error}</Alert>}
        {movements.data && filteredMovements.length === 0 && (
          <EmptyState title="Aucun mouvement sur la période" hint="Les mouvements de stock apparaîtront ici." />
        )}
        {filteredMovements.length > 0 && (
          <div>
            {filteredMovements.slice(0, 60).map((m) => (
              <div className="movement-row" key={m.id}>
                <div className="movement-main">
                  <div style={{ fontWeight: 600 }}>{m.productName}</div>
                  <div className="small muted">{MOVEMENT_LABELS[m.type] ?? m.type}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={`movement-qty ${m.quantity >= 0 ? 'in' : 'out'}`}>
                    {m.quantity >= 0 ? '+' : ''}
                    {formatPackaging(m.quantity, m.packaging)}
                  </div>
                  <div className="tiny muted">{formatDateTime(m.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
