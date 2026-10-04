import { Link } from 'react-router-dom';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@gawjaay/shared';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF, formatDateTime } from '../lib/format';
import { Alert, EmptyState, SkeletonGrid, StatusBadge } from '../components/ui';
import { BuyerShell } from '../components/BuyerHeader';
import { IconReceipt } from '../components/icons';
import { useAuth } from '../context/AuthContext';

interface Order {
  id: string;
  label: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  items: Array<{ id: string; name: string; quantity: number }>;
  store: { name: string; slug: string; city: string | null; region: string | null } | null;
}

export function MyOrdersPage() {
  const { user } = useAuth();
  const { data, loading, error } = useApi<{ orders: Order[] }>(() => api.get('/me/orders'), []);

  return (
    <BuyerShell>
      <div className="page-head">
        <div>
          <h1>Mes commandes</h1>
          <p>Historique de vos commandes passées sur la marketplace.</p>
        </div>
      </div>

      {!user && (
        <Alert kind="warning">
          Connectez-vous pour voir vos commandes.{' '}
          <Link to="/login" state={{ from: '/orders' }}>
            Se connecter
          </Link>
        </Alert>
      )}
      {loading && <SkeletonGrid count={3} height={120} />}
      {error && <Alert kind="error">{error}</Alert>}

      {data && data.orders.length === 0 && (
        <div className="card">
          <EmptyState
            title="Aucune commande"
            hint="Vos commandes passées depuis la marketplace apparaîtront ici."
            icon={<IconReceipt size={22} />}
            action={
              <Link to="/marketplace" className="btn">
                Explorer la marketplace
              </Link>
            }
          />
        </div>
      )}

      {data && data.orders.length > 0 && (
        <div className="stack">
          {data.orders.map((o) => (
            <Link to={`/orders/${o.id}`} key={o.id} className="card order-row" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="row between">
                <div>
                  <strong>{o.label}</strong> <StatusBadge status={o.status} label={ORDER_STATUS_LABELS[o.status]} />
                  <div className="small muted">
                    {o.store?.name ?? 'Boutique'}
                    {o.store && (o.store.city || o.store.region) ? ` · ${[o.store.city, o.store.region].filter(Boolean).join(', ')}` : ''}
                    {' · '}
                    {formatDateTime(o.createdAt)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong>{formatXOF(o.total)}</strong>
                  <div className="small muted">
                    {o.items.length} article{o.items.length > 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </BuyerShell>
  );
}
