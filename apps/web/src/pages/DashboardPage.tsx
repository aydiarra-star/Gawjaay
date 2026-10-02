import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF } from '../lib/format';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { Alert, Card, Chips, EmptyState, Section, Spinner, Stat } from '../components/ui';
import { IconChart, IconPackage, IconReceipt, IconTrendUp, IconWallet } from '../components/icons';

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
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: 'month', label: 'Ce mois' },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

export function DashboardPage() {
  const { storeId } = useStore();
  const { user } = useAuth();
  const [range, setRange] = useState('30d');
  const { data, loading, error } = useApi<DashboardData>(
    () => api.get<DashboardData>(`/reports/dashboard?range=${range}${storeId ? `&storeId=${storeId}` : ''}`),
    [range, storeId],
  );

  const firstName = (user?.fullName ?? '').split(' ')[0];
  const isQuiet = data ? data.revenue === 0 && data.salesCount === 0 && data.ordersCount === 0 : false;

  return (
    <>
      {/* En-tête contextuel */}
      <div className="page-head">
        <div>
          <h1>
            {greeting()}
            {firstName ? `, ${firstName}` : ''} 👋
          </h1>
          <p>Votre activité en un coup d'œil — chiffres calculés depuis vos vraies ventes.</p>
        </div>
        <Chips options={RANGES} value={range} onChange={(v) => v && setRange(v)} />
      </div>

      {loading && <Spinner label="Chargement de votre activité…" />}
      {error && <Alert kind="error">{error}</Alert>}

      {data && (
        <>
          {/* Héros : chiffre d'affaires */}
          <div className="card" style={{ padding: '28px 26px' }}>
            <div className="grid grid-2" style={{ alignItems: 'end' }}>
              <div>
                <div className="stat-label">
                  <IconTrendUp size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />
                  Chiffre d'affaires
                </div>
                <div className="stat-hero" style={{ marginTop: 10 }}>
                  {formatXOF(data.revenue)}
                </div>
                <div className="stat-trend">
                  {data.salesCount} vente{data.salesCount > 1 ? 's' : ''} sur la période
                </div>
              </div>
              <div className="kpi-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="kpi-tile plain">
                  <div className="stat-label">Panier moyen</div>
                  <div className="stat-value">{formatXOF(data.averageBasket)}</div>
                </div>
                <div className="kpi-tile plain">
                  <div className="stat-label">Marge estimée</div>
                  <div className="stat-value">{formatXOF(data.grossMargin)}</div>
                </div>
              </div>
            </div>
          </div>

          {isQuiet && (
            <Alert kind="info">
              Aucune vente sur cette période. Les indicateurs affichent 0 — aucune donnée n'est simulée. Enregistrez une
              vente depuis la caisse pour voir vos chiffres se remplir.
            </Alert>
          )}

          {/* À faire */}
          <Section title="À faire" subtitle="Les points qui demandent votre attention">
            <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <Link to="/app/orders" className="kpi-tile" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="row between">
                  <span className="stat-label">Commandes</span>
                  <IconReceipt size={18} />
                </div>
                <div className="stat-value">{data.ordersCount}</div>
                <div className="stat-trend">{data.ordersCount > 0 ? 'À traiter' : 'Aucune en attente'}</div>
              </Link>

              <Link to="/app/stock" className="kpi-tile" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="row between">
                  <span className="stat-label">Alertes de stock</span>
                  <IconPackage size={18} />
                </div>
                <div className="stat-value" style={data.lowStockCount > 0 ? { color: 'var(--danger)' } : undefined}>
                  {data.lowStockCount}
                </div>
                <div className="stat-trend">{data.lowStockCount > 0 ? 'Produits sous le seuil' : 'Tout est au-dessus du seuil'}</div>
              </Link>

              <Link to="/app/customers" className="kpi-tile" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="row between">
                  <span className="stat-label">À encaisser</span>
                  <IconWallet size={18} />
                </div>
                <div className="stat-value">{formatXOF(data.receivables)}</div>
                <div className="stat-trend">Créances clients</div>
              </Link>

              <Link to="/app/purchases" className="kpi-tile" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="row between">
                  <span className="stat-label">À payer</span>
                  <IconWallet size={18} />
                </div>
                <div className="stat-value">{formatXOF(data.payables)}</div>
                <div className="stat-trend">Dettes fournisseurs</div>
              </Link>
            </div>
          </Section>

          {/* Chiffres clés */}
          <Section title="Chiffres clés" subtitle="Votre boutique en volume">
            <div className="grid grid-stats">
              <Stat label="Produits actifs" value={data.productsCount} />
              <Stat label="Clients" value={data.customersCount} />
              <Stat label="Achats reçus" value={formatXOF(data.purchasesTotal)} />
              <Stat label="Commandes" value={data.ordersCount} />
            </div>
          </Section>

          {/* Alertes de stock */}
          <Section
            title="Alertes de stock"
            subtitle="Produits passés sous leur seuil d'alerte"
            actions={
              data.lowStock.length > 0 ? (
                <Link to="/app/stock" className="btn btn-secondary btn-sm">
                  Gérer le stock
                </Link>
              ) : undefined
            }
          >
            <Card flush>
              {data.lowStock.length === 0 ? (
                <EmptyState
                  title="Aucune alerte"
                  hint="Aucun produit sous son seuil d'alerte. Votre stock est sain."
                  icon={<IconPackage size={22} />}
                />
              ) : (
                <div className="table-wrap" style={{ border: 'none' }}>
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
                          <td style={{ fontWeight: 600 }}>{row.productName}</td>
                          <td className="muted">{row.variantName}</td>
                          <td className="muted">{row.storeName}</td>
                          <td className="num">
                            <span className="badge badge-danger">{row.quantity}</span>
                          </td>
                          <td className="num muted">{row.threshold}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </Section>

          {/* Raccourcis */}
          <Section title="Poursuivre" subtitle="Accès directs aux actions courantes">
            <div className="grid grid-cols-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <Link to="/app/pos" className="card" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="feature-icon" style={{ marginBottom: 0 }}>
                  <IconReceipt size={19} />
                </span>
                <div>
                  <div style={{ fontWeight: 650 }}>Encaisser une vente</div>
                  <div className="small muted">Ouvrir la caisse</div>
                </div>
              </Link>
              <Link to="/app/products" className="card" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="feature-icon" style={{ marginBottom: 0 }}>
                  <IconPackage size={19} />
                </span>
                <div>
                  <div style={{ fontWeight: 650 }}>Ajouter un produit</div>
                  <div className="small muted">Gérer le catalogue</div>
                </div>
              </Link>
              <Link to="/app/reports" className="card" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="feature-icon" style={{ marginBottom: 0 }}>
                  <IconChart size={19} />
                </span>
                <div>
                  <div style={{ fontWeight: 650 }}>Voir les rapports</div>
                  <div className="small muted">Analyse comptable</div>
                </div>
              </Link>
            </div>
          </Section>
        </>
      )}
    </>
  );
}
