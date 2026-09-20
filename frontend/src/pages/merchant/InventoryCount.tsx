import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

/** LOT B — Inventaire : comptage physique avec écarts traçables (mobile-first). */
export default function InventoryCount() {
  const { storeId } = useParams();
  const [counts, setCounts] = useState<any[]>([]);
  const [current, setCurrent] = useState<any>(null);
  const [msg, setMsg] = useState('');

  const load = () => api.get(`/inventory-counts/store/${storeId}`).then((r) => setCounts(r.data));
  useEffect(() => { load(); }, [storeId]);

  const start = async () => {
    setMsg('');
    try {
      const r = await api.post(`/inventory-counts/store/${storeId}/start`, {});
      setCurrent(r.data);
      load();
    } catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };
  const open = async (id: string) => {
    const r = await api.get(`/inventory-counts/${id}`);
    setCurrent(r.data);
  };
  const setQty = async (productId: string, value: string) => {
    if (value === '') return;
    try {
      await api.patch(`/inventory-counts/${current.id}/items`, { productId, countedQty: parseFloat(value) });
      const r = await api.get(`/inventory-counts/${current.id}`);
      setCurrent(r.data);
    } catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };
  const confirm = async () => {
    if (!window.confirm('Confirmer l ajustement du stock selon les écarts comptés ? Cette opération est traçable.')) return;
    try {
      const r = await api.post(`/inventory-counts/${current.id}/confirm`, {});
      setCurrent(r.data);
      setMsg('✅ Inventaire confirmé, écarts journalisés.');
      load();
    } catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };
  const cancel = async () => {
    if (!window.confirm('Annuler cet inventaire ?')) return;
    await api.post(`/inventory-counts/${current.id}/cancel`, {});
    setCurrent(null);
    load();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Inventaire</h1>
      {msg && <p className="bg-green-50 border border-green-200 text-green-800 p-2 rounded mb-4 text-sm">{msg}</p>}

      {!current ? (
        <>
          <button onClick={start} className="bg-green-700 text-white px-4 py-3 rounded mb-6 w-full md:w-auto">▶ Démarrer un inventaire</button>
          <div className="space-y-2">
            {counts.map((c: any) => (
              <button key={c.id} onClick={() => open(c.id)} className="bg-white p-4 rounded shadow w-full text-left flex justify-between items-center">
                <span>{new Date(c.startedAt).toLocaleString('fr-FR')}</span>
                <span className={`text-xs px-2 py-1 rounded ${c.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' : c.status === 'CANCELLED' ? 'bg-gray-100' : 'bg-orange-100 text-orange-800'}`}>{c.status}</span>
              </button>
            ))}
            {!counts.length && <p className="text-gray-500 text-sm">Aucun inventaire. Démarrez le premier !</p>}
          </div>
        </>
      ) : (
        <div>
          <div className="flex flex-wrap gap-2 justify-between items-center mb-4">
            <p className="text-sm text-gray-600">Inventaire {current.id.slice(0, 8)} — {current.status} — {new Date(current.startedAt).toLocaleString('fr-FR')}</p>
            {current.status === 'OPEN' && (
              <div className="flex gap-2">
                <button onClick={confirm} className="bg-green-700 text-white px-4 py-2 rounded text-sm">✓ Confirmer les écarts</button>
                <button onClick={cancel} className="border px-4 py-2 rounded text-sm">Annuler</button>
              </div>
            )}
          </div>
          <div className="bg-white rounded shadow overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="p-2">Produit</th>
                  <th className="p-2">Théorique</th>
                  <th className="p-2">Compté</th>
                  <th className="p-2">Écart</th>
                </tr>
              </thead>
              <tbody>
                {current.items.map((it: any) => (
                  <tr key={it.id} className="border-b">
                    <td className="p-2">{it.productName}</td>
                    <td className="p-2">{it.systemQty}</td>
                    <td className="p-2">
                      {current.status === 'OPEN' ? (
                        <input
                          type="number" min="0" step="any"
                          defaultValue={it.countedQty ?? ''}
                          onBlur={(e) => setQty(it.productId, e.target.value)}
                          className="border p-1 w-20"
                        />
                      ) : (it.countedQty ?? '—')}
                    </td>
                    <td className={`p-2 font-bold ${(it.difference ?? 0) < 0 ? 'text-red-600' : (it.difference ?? 0) > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                      {it.difference == null ? '—' : it.difference > 0 ? `+${it.difference}` : it.difference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-2">Chaque écart confirmé crée un mouvement de stock traçable (type INVENTORY).</p>
        </div>
      )}
    </div>
  );
}
