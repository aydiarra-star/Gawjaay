import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@gawjaay/shared';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF, formatDateTime } from '../lib/format';
import { Alert, EmptyState, Spinner, StatusBadge } from '../components/ui';
import { BuyerShell } from '../components/BuyerHeader';
import { IconReceipt } from '../components/icons';

interface OrderDetail {
  id: string;
  label: string;
  status: OrderStatus;
  total: number;
  subtotal: number;
  deliveryFee: number;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string | null;
  deliveryRegion: string | null;
  note: string | null;
  items: Array<{ id: string; name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  events: Array<{ id: string; toStatus: string; note: string | null; createdAt: string }>;
  payments: Array<{ id: string; amount: number; method: string; status: string }>;
  delivery: { status: string; fee: number; address: string | null } | null;
  store: { name: string; slug: string; city: string | null; region: string | null; phone: string | null } | null;
}

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useApi<{ order: OrderDetail; cancellable: boolean }>(
    () => api.get(`/me/orders/${encodeURIComponent(id)}`),
    [id],
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const paymentSuccess = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('payment') === 'success';

  useEffect(() => {
    if (!paymentSuccess || !data?.order || data.order.status !== 'PENDING') return;
    const timer = window.setTimeout(() => reload(), 1500);
    return () => window.clearTimeout(timer);
  }, [paymentSuccess, data?.order?.status, reload]);

  async function cancel() {
    setActionError(null);
    setBusy(true);
    try {
      await api.post(`/me/orders/${encodeURIComponent(id)}/cancel`, {});
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Annulation impossible');
    } finally {
      setBusy(false);
    }
  }

  const order = data?.order;
  const paid = (order?.payments ?? []).filter((p) => p.status === 'SUCCESSFUL').reduce((s, p) => s + p.amount, 0);

  return (
    <BuyerShell>
      <div className="page-head">
        <div>
          <h1>Commande</h1>
          <p>{order?.label ?? '—'}</p>
        </div>
        <Link to="/orders" className="btn btn-secondary btn-sm">
          Toutes mes commandes
        </Link>
      </div>

      {loading && <Spinner />}
      {error && <Alert kind="error">{error}</Alert>}
      {actionError && <Alert kind="error">{actionError}</Alert>}
      {paymentSuccess && (
        <Alert kind={order?.status === 'CONFIRMED' ? 'success' : 'warning'}>
          {order?.status === 'CONFIRMED' ? 'Paiement Stripe confirmé. Votre commande est confirmée.' : 'Retour de Stripe reçu. La confirmation du paiement est en cours ; cette page se met à jour automatiquement.'}
        </Alert>
      )}

      {!loading && !error && !order && (
        <div className="card">
          <EmptyState title="Commande introuvable" hint="Cette commande n'existe pas ou ne vous appartient pas." icon={<IconReceipt size={22} />} />
        </div>
      )}

      {order && (
        <>
          <div className="card">
            <div className="row between">
              <div>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <strong>{order.label}</strong>
                  <StatusBadge status={order.status} label={ORDER_STATUS_LABELS[order.status]} />
                </div>
                <div className="small muted">{formatDateTime(order.createdAt)}</div>
              </div>
              <strong style={{ fontSize: '1.3rem' }}>{formatXOF(order.total)}</strong>
            </div>
            {data?.cancellable && (
              <button className="btn btn-danger btn-sm" style={{ marginTop: 12 }} onClick={cancel} disabled={busy}>
                {busy ? 'Annulation…' : 'Annuler la commande'}
              </button>
            )}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>Articles</h2>
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {order.items.map((i) => (
                <li key={i.id}>
                  {i.quantity} × {i.name} — {formatXOF(i.unitPrice)} = <strong>{formatXOF(i.lineTotal)}</strong>
                </li>
              ))}
            </ul>
            <div className="row between" style={{ marginTop: 10 }}>
              <span className="muted">Sous-total</span>
              <span>{formatXOF(order.subtotal)}</span>
            </div>
            {order.deliveryFee > 0 && (
              <div className="row between">
                <span className="muted">Livraison</span>
                <span>{formatXOF(order.deliveryFee)}</span>
              </div>
            )}
            <div className="row between">
              <strong>Total</strong>
              <strong>{formatXOF(order.total)}</strong>
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>Retrait / livraison</h2>
            <p className="small muted" style={{ marginTop: 0 }}>
              Boutique : <strong>{order.store?.name ?? '—'}</strong>
              {order.store && (order.store.city || order.store.region) ? ` — ${[order.store.city, order.store.region].filter(Boolean).join(', ')}` : ''}
              {order.store?.phone ? ` · ${order.store.phone}` : ''}
            </p>
            {order.delivery ? (
              <p className="small muted">
                Livraison : {order.delivery.status}
                {order.delivery.address ? ` — ${order.delivery.address}` : ''}
              </p>
            ) : (
              <p className="small muted">
                Retrait en boutique. Aucun créneau ni adresse n'est inventé : la boutique vous contacte au {order.customerPhone}.
              </p>
            )}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>Paiement</h2>
            {paid > 0 ? (
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {order.payments
                  .filter((p) => p.status === 'SUCCESSFUL')
                  .map((p) => (
                    <li key={p.id}>
                      {p.method} — {formatXOF(p.amount)}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="small muted" style={{ marginBottom: 0 }}>
                Paiement en ligne indisponible. Réglez directement le vendeur (espèces ou mobile money) au retrait.
                La commande n'est pas présentée comme payée.
              </p>
            )}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h2>Suivi</h2>
            <ol className="order-timeline">
              {order.events.map((e) => (
                <li key={e.id}>
                  <span className="timeline-dot" aria-hidden="true" />
                  <span>
                    <strong>{ORDER_STATUS_LABELS[e.toStatus as OrderStatus] ?? e.toStatus}</strong>
                    <span className="small muted" style={{ display: 'block' }}>
                      {formatDateTime(e.createdAt)}
                      {e.note ? ` · ${e.note}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </BuyerShell>
  );
}
