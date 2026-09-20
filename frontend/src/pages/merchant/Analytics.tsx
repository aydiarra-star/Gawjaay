import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

/** LOT B — Analytics avancés (mobile-first). Indicateurs réels uniquement. */
export default function Analytics() {
  const { storeId } = useParams();
  const [data, setData] = useState<any>(null);
  const [range, setRange] = useState(30);

  useEffect(() => {
    const from = new Date(Date.now() - range * 86400000).toISOString();
    api.get(`/analytics/store/${storeId}?from=${from}`).then((r) => setData(r.data));
  }, [storeId, range]);

  if (!data) return <div>Chargement...</div>;

  const maxTrend = Math.max(1, ...data.sales.trend.map((t: any) => t.total));

  return (
    <div>
      <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <select className="border p-2 text-sm" value={range} onChange={(e) => setRange(parseInt(e.target.value))}>
          <option value={7}>7 derniers jours</option>
          <option value={30}>30 derniers jours</option>
          <option value={90}>90 derniers jours</option>
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-white p-4 rounded shadow"><p className="text-xs text-gray-500">Ventes aujourd'hui</p><p className="text-xl font-bold">{data.sales.today.total} F</p><p className="text-xs">{data.sales.today.count} ventes</p></div>
        <div className="bg-white p-4 rounded shadow"><p className="text-xs text-gray-500">7 jours</p><p className="text-xl font-bold">{data.sales.last7days.total} F</p></div>
        <div className="bg-white p-4 rounded shadow"><p className="text-xs text-gray-500">30 jours</p><p className="text-xl font-bold">{data.sales.last30days.total} F</p></div>
        <div className="bg-white p-4 rounded shadow"><p className="text-xs text-gray-500">Panier moyen</p><p className="text-xl font-bold">{data.clients.averageBasket} F</p></div>
      </div>

      <div className="bg-white p-4 rounded shadow mb-6">
        <h3 className="font-bold mb-3">Tendance ({range} j)</h3>
        <div className="flex items-end gap-1 h-32">
          {data.sales.trend.map((t: any) => (
            <div key={t.date} className="flex-1 bg-green-600 rounded-t min-h-[2px]" style={{ height: `${(t.total / maxTrend) * 100}%` }} title={`${t.date}: ${t.total} F`} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">🏆 Top produits (CA)</h3>
          <div className="space-y-1 text-sm max-h-64 overflow-auto">
            {data.products.topRevenue.map((p: any, i: number) => (
              <div key={p.id} className="flex justify-between border-b py-1">
                <span>{i + 1}. {p.name}</span><span className="font-bold">{p.revenue} F <span className="text-gray-400 font-normal">×{p.qtySold}</span></span>
              </div>
            ))}
            {!data.products.topRevenue.length && <p className="text-gray-500">Aucune vente sur la période.</p>}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">👥 Clients</h3>
          <div className="grid grid-cols-3 gap-2 text-center text-sm mb-2">
            <div className="bg-gray-50 p-2 rounded"><p className="text-lg font-bold">{data.clients.activeCount}</p>actifs</div>
            <div className="bg-gray-50 p-2 rounded"><p className="text-lg font-bold">{data.clients.newCount}</p>nouveaux</div>
            <div className="bg-gray-50 p-2 rounded"><p className="text-lg font-bold">{data.clients.recurringCount}</p>récurrents</div>
          </div>
          <div className="space-y-1 text-sm max-h-40 overflow-auto">
            {data.clients.top.filter((c: any) => c.salesCount > 0).slice(0, 5).map((c: any) => (
              <div key={c.id} className="flex justify-between border-b py-1"><span>{c.name}</span><span>{c.totalSpent} F ({c.salesCount})</span></div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">⚠️ Stock sous seuil ({data.stock.underThreshold.length})</h3>
          <div className="space-y-1 text-sm max-h-40 overflow-auto">
            {data.stock.underThreshold.map((p: any) => (
              <div key={p.id} className="flex justify-between border-b py-1 text-red-700"><span>{p.name}</span><span>{p.stock} restants (seuil {p.lowStockThreshold})</span></div>
            ))}
            {!data.stock.underThreshold.length && <p className="text-gray-500">Rien à signaler.</p>}
          </div>
          <h3 className="font-bold mb-2 mt-4">😴 Produits dormants ({data.stock.dormant.length})</h3>
          <p className="text-xs text-gray-500">{data.stock.dormant.slice(0, 5).map((p: any) => p.name).join(', ') || 'Aucun'}</p>
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">💰 Finance (période)</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between border-b py-1"><span>Chiffre d'affaires (ventes réelles)</span><span className="font-bold">{data.finance.revenue} F</span></div>
            <div className="flex justify-between border-b py-1"><span>Dépenses saisies</span><span className="font-bold">{data.finance.expenses} F</span></div>
            <div className="flex justify-between border-b py-1">
              <span>Marge estimée</span>
              <span className="font-bold">{data.finance.margeEstimee === null ? '—' : `${data.finance.margeEstimee} F`}</span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">{data.finance.note}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded shadow mt-6">
        <h3 className="font-bold mb-2">📤 Exports CSV</h3>
        <div className="flex flex-wrap gap-2">
          {['sales', 'products', 'stock', 'orders', 'customers', 'expenses'].map((t) => (
            <a key={t} href={`/api/v1/exports/${t}/store/${storeId}`} className="border border-green-700 text-green-700 px-3 py-2 rounded text-sm capitalize">{t}</a>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">Les exports respectent l'isolation de votre boutique.</p>
      </div>
    </div>
  );
}
