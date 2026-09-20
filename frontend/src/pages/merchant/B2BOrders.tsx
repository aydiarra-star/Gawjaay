import { useEffect, useState } from 'react';
import api from '../../lib/api';

/** LOT D — B2B côté acheteur (commerçant) : catalogues pro, commande, suivi, réception (mobile-first). */
export default function B2BOrders() {
  const [stores, setStores] = useState<any[]>([]);
  const [catalogs, setCatalogs] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [storeId, setStoreId] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => {
    api.get('/stores/my').then((r) => { setStores(r.data); if (r.data[0]) setStoreId(r.data[0].id); }).catch(() => {});
    api.get('/b2b/catalogs').then((r) => setCatalogs(r.data)).catch(() => {});
    api.get('/b2b/orders?role=buyer').then((r) => setOrders(r.data)).catch(() => {});
  };
  useEffect(load, []);

  const open = async (id: string) => {
    try { const r = await api.get(`/b2b/catalogs/${id}`); setDetail(r.data); setCart([]); }
    catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };
  const add = (it: any) => {
    if (cart.find((c) => c.productId === it.productId)) return;
    setCart([...cart, { productId: it.productId, productName: it.productName, proPrice: it.proPrice, minQty: it.minQty, quantity: it.minQty }]);
  };
  const qty = (i: number, q: number) => {
    const c = [...cart]; c[i] = { ...c[i], quantity: Math.max(c[i].minQty, q) }; setCart(c);
  };
  const total = cart.reduce((s, c) => s + c.proPrice * c.quantity, 0);
  const min = detail?.minOrderAmount || 0;

  const submit = async () => {
    try {
      await api.post('/b2b/orders', { catalogId: detail.id, buyerStoreId: storeId, items: cart.map(({ productId, quantity }: any) => ({ productId, quantity })) });
      setMsg('✅ Commande professionnelle envoyée.'); setDetail(null); setCart([]); load();
    } catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };
  const receive = async (id: string) => {
    try { await api.patch(`/b2b/orders/${id}/status`, { status: 'RECUE' }); setMsg('✅ Réception confirmée — stock mis à jour.'); load(); }
    catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };
  const cancel = async (id: string) => {
    try { await api.patch(`/b2b/orders/${id}/status`, { status: 'ANNULEE' }); load(); }
    catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Commandes professionnelles</h1>
      {msg && <p className="bg-green-50 border border-green-200 text-green-800 p-2 rounded mb-4 text-sm">{msg}</p>}

      {!detail && (
        <>
          <h2 className="font-bold mb-2">Catalogues disponibles</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {catalogs.map((c: any) => (
              <button key={c.id} className="bg-white p-4 rounded shadow text-left" onClick={() => open(c.id)}>
                <p className="font-bold">{c.name}</p>
                <p className="text-sm text-gray-600">{c.companyName}</p>
                <p className="text-xs text-gray-500">Min. {c.minOrderAmount} FCFA</p>
              </button>
            ))}
            {catalogs.length === 0 && <p className="text-sm text-gray-500">Aucun catalogue publié pour le moment.</p>}
          </div>

          <h2 className="font-bold mb-2">Mes commandes B2B</h2>
          {orders.map((o: any) => (
            <div key={o.id} className="bg-white p-4 rounded shadow mb-3">
              <div className="flex justify-between items-center">
                <p className="font-bold">{o.orderNumber}</p>
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{o.status}</span>
              </div>
              <p className="text-sm">{o.totalAmount} FCFA</p>
              {['BROUILLON', 'ENVOYEE', 'ACCEPTEE'].includes(o.status) && (
                <button className="mt-2 text-red-600 text-sm underline" onClick={() => cancel(o.id)}>Annuler</button>
              )}
              {o.status === 'EXPEDIEE' && (
                <button className="mt-2 w-full bg-green-600 text-white p-2 rounded text-sm font-bold" onClick={() => receive(o.id)}>Confirmer la réception</button>
              )}
            </div>
          ))}
          {orders.length === 0 && <p className="text-sm text-gray-500">Aucune commande.</p>}
        </>
      )}

      {detail && (
        <div>
          <button className="text-blue-600 text-sm mb-3 underline" onClick={() => setDetail(null)}>← Retour aux catalogues</button>
          <h2 className="font-bold mb-2">{detail.name} — {detail.companyName}</h2>
          <div className="bg-white rounded shadow divide-y mb-4">
            {detail.items.map((it: any) => (
              <div key={it.productId} className="p-3 flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm">{it.productName}</p>
                  <p className="text-xs text-gray-500">{it.proPrice} FCFA · min. {it.minQty} · stock grossiste {it.availableQty}</p>
                </div>
                <button className="bg-gray-800 text-white px-3 py-1 rounded text-sm" onClick={() => add(it)}>Ajouter</button>
              </div>
            ))}
          </div>
          <h3 className="font-bold mb-2">Ma commande ({total} / min {min} FCFA)</h3>
          <select className="border p-2 w-full mb-3" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s: any) => <option key={s.id} value={s.id}>Livrer à : {s.name}</option>)}
          </select>
          {cart.map((c, i) => (
            <div key={c.productId} className="flex items-center gap-2 bg-white p-3 rounded shadow mb-2">
              <span className="flex-1 text-sm">{c.productName} · {c.proPrice} F</span>
              <input className="border p-1 w-16 text-sm" type="number" min={c.minQty} value={c.quantity} onChange={(e) => qty(i, parseInt(e.target.value) || c.minQty)} />
              <span className="text-sm w-20 text-right">{c.proPrice * c.quantity} F</span>
            </div>
          ))}
          <button className="w-full bg-blue-600 text-white p-3 rounded font-bold disabled:opacity-50" disabled={total < min || cart.length === 0 || !storeId} onClick={submit}>
            {total < min ? `Encore ${min - total} FCFA pour commander` : 'Envoyer la commande'}
          </button>
        </div>
      )}
    </div>
  );
}
