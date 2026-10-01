import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF, formatDateTime } from '../lib/format';
import { Alert, Card, EmptyState, PageHead, Spinner, StatusBadge } from '../components/ui';

interface Delivery {
  id: string;
  status: string;
  fee: number;
  address: string | null;
  createdAt: string;
  order: { id: string; customerName: string; customerPhone: string; total: number };
}

const STATUS_OPTIONS = ['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED'];

export function DeliveriesPage() {
  const { data, loading, error, reload } = useApi<{ deliveries: Delivery[] }>(() => api.get('/deliveries'), []);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setStatus(id: string, status: string) {
    setActionError(null);
    setBusyId(id);
    try {
      await api.patch(`/deliveries/${id}`, { status });
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Mise à jour impossible');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHead title="Livraisons" subtitle="Suivi des livraisons rattachées aux commandes." />
      {actionError && <Alert kind="error">{actionError}</Alert>}

      <Card title="Livraisons">
        {loading && <Spinner />}
        {error && <Alert kind="error">{error}</Alert>}
        {data && data.deliveries.length === 0 && (
          <EmptyState title="Aucune livraison" hint="Les livraisons apparaissent lorsqu'une commande prévoit une adresse de livraison." />
        )}
        {data && data.deliveries.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Téléphone</th>
                  <th>Adresse</th>
                  <th className="num">Frais</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.deliveries.map((d) => (
                  <tr key={d.id}>
                    <td>{d.order.customerName}</td>
                    <td>{d.order.customerPhone}</td>
                    <td>{d.address ?? <span className="muted">—</span>}</td>
                    <td className="num">{formatXOF(d.fee)}</td>
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
                    <td>
                      <select
                        aria-label={`Statut de la livraison ${d.id}`}
                        value={d.status}
                        disabled={busyId === d.id}
                        onChange={(e) => setStatus(d.id, e.target.value)}
                        style={{ width: 'auto' }}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="small muted" style={{ marginTop: 8 }}>
        Dernière mise à jour : {formatDateTime(new Date())}
      </p>
    </>
  );
}
