import { useState } from 'react';
import { allowedTransitions, ORDER_STATUS_LABELS, type OrderStatus } from '@gawjaay/shared';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF, formatDateTime } from '../lib/format';
import { Alert, Card, EmptyState, PageHead, Spinner, StatusBadge } from '../components/ui';

interface Order {
  id: string;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  total: number;
  deliveryFee: number;
  deliveryAddress: string | null;
  createdAt: string;
  items: Array<{ id: string; name: string; quantity: number; unitPrice: number }>;
}

export function OrdersPage() {
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useApi<{ orders: Order[] }>(
    () => api.get(`/orders${status ? `?status=${status}` : ''}`),
    [status],
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function transition(orderId: string, to: OrderStatus) {
    setActionError(null);
    setBusyId(orderId);
    try {
      await api.post(`/orders/${orderId}/transition`, { to });
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Transition impossible');
    } finally {
      setBusyId(null);
    }
  }

  const STATUS_OPTIONS: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED'];

  return (
    <>
      <PageHead
        title="Commandes"
        subtitle="Commandes en ligne reçues par votre organisation."
        actions={
          <select aria-label="Filtrer par statut" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Tous les statuts</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        }
      />

      {actionError && <Alert kind="error">{actionError}</Alert>}
      {loading && <Spinner />}
      {error && <Alert kind="error">{error}</Alert>}

      {data && data.orders.length === 0 && <EmptyState title="Aucune commande" hint="Les commandes passées sur vos boutiques publiques apparaîtront ici." />}

      {data && data.orders.length > 0 && (
        <div className="stack">
          {data.orders.map((order) => (
            <Card key={order.id}>
              <div className="row between">
                <div>
                  <h3>
                    {order.customerName} <StatusBadge status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
                  </h3>
                  <p className="small muted">
                    {order.customerPhone} · {formatDateTime(order.createdAt)}
                    {order.deliveryAddress ? ` · ${order.deliveryAddress}` : ''}
                  </p>
                </div>
                <strong>{formatXOF(order.total)}</strong>
              </div>
              <ul className="small muted" style={{ margin: '8px 0', paddingLeft: 18 }}>
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.quantity} × {item.name} — {formatXOF(item.unitPrice * item.quantity)}
                  </li>
                ))}
              </ul>
              <div className="row">
                {allowedTransitions(order.status).map((to) => (
                  <button
                    key={to}
                    className={`btn btn-sm ${to === 'CANCELLED' ? 'btn-danger' : 'btn-secondary'}`}
                    disabled={busyId === order.id}
                    onClick={() => transition(order.id, to)}
                  >
                    {ORDER_STATUS_LABELS[to]}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
