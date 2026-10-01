import { useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF } from '../lib/format';
import { useStore } from '../context/StoreContext';
import { Alert, Card, EmptyState, PageHead, Spinner } from '../components/ui';

interface SalesStats {
  daily: Array<{ date: string; revenue: number; count: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  totals: { revenue: number; count: number };
}

const RANGES = [
  { value: 'today', label: "Aujourd'hui" },
  { value: '7d', label: '7 derniers jours' },
  { value: '30d', label: '30 derniers jours' },
  { value: 'month', label: 'Ce mois' },
];

export function ReportsPage() {
  const { storeId } = useStore();
  const [range, setRange] = useState('30d');
  const { data, loading, error } = useApi<SalesStats>(
    () => api.get<SalesStats>(`/reports/sales?range=${range}${storeId ? `&storeId=${storeId}` : ''}`),
    [range, storeId],
  );

  const averageBasket = data && data.totals.count > 0 ? Math.round(data.totals.revenue / data.totals.count) : 0;

  return (
    <>
      <PageHead
        title="Rapports"
        subtitle="Ventes et meilleurs produits — calculés depuis vos données réelles."
        actions={
          <select aria-label="Période" value={range} onChange={(e) => setRange(e.target.value)} style={{ width: 'auto' }}>
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        }
      />

      {loading && <Spinner />}
      {error && <Alert kind="error">{error}</Alert>}

      {data && (
        <>
          <div className="grid grid-stats">
            <div className="card">
              <div className="stat-label">Chiffre d'affaires</div>
              <div className="stat-value">{formatXOF(data.totals.revenue)}</div>
            </div>
            <div className="card">
              <div className="stat-label">Ventes</div>
              <div className="stat-value">{data.totals.count}</div>
            </div>
            <div className="card">
              <div className="stat-label">Panier moyen</div>
              <div className="stat-value">{formatXOF(averageBasket)}</div>
            </div>
          </div>

          <Card title="Ventes par jour">
            {data.daily.length === 0 ? (
              <EmptyState title="Aucune vente" hint="Aucune vente enregistrée sur la période." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Jour</th>
                      <th className="num">Ventes</th>
                      <th className="num">Chiffre d'affaires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((d) => (
                      <tr key={d.date}>
                        <td>{d.date}</td>
                        <td className="num">{d.count}</td>
                        <td className="num">{formatXOF(d.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Meilleurs produits">
            {data.topProducts.length === 0 ? (
              <EmptyState title="Aucune donnée" hint="Pas encore de produits vendus sur la période." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th className="num">Quantité vendue</th>
                      <th className="num">Chiffre d'affaires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td className="num">{p.quantity}</td>
                        <td className="num">{formatXOF(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
