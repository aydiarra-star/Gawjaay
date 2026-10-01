import { useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF } from '../lib/format';
import { useStore } from '../context/StoreContext';
import { Alert, Card, EmptyState, PageHead, Spinner } from '../components/ui';

interface DashboardData {
  range: { from: string; to: string };
  revenue: number;
  salesCount: number;
  averageBasket: number;
  grossMargin: number;
  ordersCount: number;
  ordersByStatus: Record<string, number>;
  productsCount: number;
  lowStockCount: number;
  lowStock: Array<{ variantId: string; productName: string; variantName: string; quantity: number; threshold: number; storeName: string }>;
  customersCount: number;
  purchasesTotal: number;
  receivables: number;
  payables: number;
}

const RANGES = [
  { value: 'today', label: "Aujourd'hui" },
  { value: '7d', label: '7 derniers jours' },
  { value: '30d', label: '30 derniers jours' },
  { value: 'month', label: 'Ce mois' },
];

export function DashboardPage() {
  const { storeId } = useStore();
  const [range, setRange] = useState('30d');
  const { data, loading, error } = useApi<DashboardData>(
    () => api.get<DashboardData>(`/reports/dashboard?range=${range}${storeId ? `&storeId=${storeId}` : ''}`),
    [range, storeId],
  );

  return (
    <>
      <PageHead
        title="Tableau de bord"
        subtitle="Indicateurs calculés à partir de vos ventes et de vos données réelles."
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
          {data.revenue === 0 && data.salesCount === 0 && (
            <Alert kind="info">
              Aucune vente enregistrée sur cette période. Les indicateurs affichent 0 : aucune donnée n'est simulée.
            </Alert>
          )}
          <div className="grid grid-stats">
            <Stat label="Chiffre d'affaires" value={formatXOF(data.revenue)} />
            <Stat label="Ventes" value={String(data.salesCount)} />
            <Stat label="Panier moyen" value={formatXOF(data.averageBasket)} />
            <Stat label="Marge estimée" value={formatXOF(data.grossMargin)} />
            <Stat label="Commandes" value={String(data.ordersCount)} />
            <Stat label="Créances clients" value={formatXOF(data.receivables)} />
            <Stat label="Dettes fournisseurs" value={formatXOF(data.payables)} />
            <Stat label="Produits actifs" value={String(data.productsCount)} />
            <Stat label="Clients" value={String(data.customersCount)} />
            <Stat label="Achats reçus" value={formatXOF(data.purchasesTotal)} />
          </div>

          <Card title="Alertes de stock" >
            {data.lowStock.length === 0 ? (
              <EmptyState title="Aucune alerte" hint="Aucun produit sous son seuil d'alerte." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Variante</th>
                      <th>Boutique</th>
                      <th className="num">Stock</th>
                      <th className="num">Seuil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lowStock.map((row) => (
                      <tr key={row.variantId}>
                        <td>{row.productName}</td>
                        <td>{row.variantName}</td>
                        <td>{row.storeName}</td>
                        <td className="num">
                          <span className="badge badge-danger">{row.quantity}</span>
                        </td>
                        <td className="num">{row.threshold}</td>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
