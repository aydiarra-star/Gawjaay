import { useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF } from '../lib/format';
import { useStore } from '../context/StoreContext';
import { Alert, Card, Chips, EmptyState, PageHead, Spinner } from '../components/ui';
import { IconChart, IconTrendUp } from '../components/icons';

interface SalesStats {
  daily: Array<{ date: string; revenue: number; count: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  totals: { revenue: number; count: number };
}

const RANGES = [
  { value: 'today', label: "Aujourd'hui" },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
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
  const maxRevenue = data ? Math.max(1, ...data.daily.map((d) => d.revenue)) : 1;

  return (
    <>
      <PageHead
        title="Rapports"
        subtitle="Ventes et meilleurs produits — calculés depuis vos données réelles."
        actions={<Chips options={RANGES} value={range} onChange={(v) => v && setRange(v)} />}
      />

      {loading && <Spinner />}
      {error && <Alert kind="error">{error}</Alert>}

      {data && (
        <>
          {/* Résumé comptable premium */}
          <div className="card" style={{ padding: '26px 24px' }}>
            <div className="stat-label">
              <IconTrendUp size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              Chiffre d'affaires
            </div>
            <div className="stat-hero" style={{ marginTop: 10 }}>
              {formatXOF(data.totals.revenue)}
            </div>
            <div className="stat-trend">{data.totals.count} vente{data.totals.count > 1 ? 's' : ''} sur la période</div>

            <div className="kpi-row" style={{ marginTop: 22 }}>
              <div className="kpi-tile plain">
                <div className="stat-label">Ventes</div>
                <div className="stat-value">{data.totals.count}</div>
              </div>
              <div className="kpi-tile plain">
                <div className="stat-label">Panier moyen</div>
                <div className="stat-value">{formatXOF(averageBasket)}</div>
              </div>
              <div className="kpi-tile plain">
                <div className="stat-label">Jours actifs</div>
                <div className="stat-value">{data.daily.length}</div>
              </div>
            </div>
          </div>

          {/* Ventes par jour — visualisation */}
          <Card title="Ventes par jour">
            {data.daily.length === 0 ? (
              <EmptyState title="Aucune vente" hint="Aucune vente enregistrée sur la période." icon={<IconChart size={22} />} />
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.daily.map((d) => (
                    <div key={d.date} style={{ display: 'grid', gridTemplateColumns: '92px 1fr auto', gap: 12, alignItems: 'center' }}>
                      <span className="small muted">{d.date}</span>
                      <span
                        style={{
                          height: 8,
                          borderRadius: 'var(--r-pill)',
                          background: 'var(--surface-3)',
                          overflow: 'hidden',
                          display: 'block',
                        }}
                      >
                        <span
                          style={{
                            display: 'block',
                            height: '100%',
                            width: `${Math.max(3, (d.revenue / maxRevenue) * 100)}%`,
                            background: 'linear-gradient(90deg, var(--brand) 0%, var(--brand-strong) 100%)',
                            borderRadius: 'var(--r-pill)',
                            transition: 'width var(--dur-slow) var(--ease-out)',
                          }}
                        />
                      </span>
                      <span className="num small" style={{ fontWeight: 620, minWidth: 96, textAlign: 'right' }}>
                        {formatXOF(d.revenue)}
                      </span>
                    </div>
                  ))}
                </div>
                <hr className="divider" />
                <div className="table-wrap" style={{ border: 'none' }}>
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
              </>
            )}
          </Card>

          <Card title="Meilleurs produits">
            {data.topProducts.length === 0 ? (
              <EmptyState title="Aucune donnée" hint="Pas encore de produits vendus sur la période." />
            ) : (
              <div className="table-wrap" style={{ border: 'none' }}>
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
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
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
