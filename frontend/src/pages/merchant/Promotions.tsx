import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

/** LOT A — Page Promotions du marchand (mobile-first). */
export default function Promotions() {
  const { storeId } = useParams();
  const [items, setItems] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', type: 'PERCENT', value: '', dateStart: new Date().toISOString().slice(0, 16), dateEnd: '', minQty: '1', maxQty: '', maxUses: '', productIds: [] as string[] });
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = () => {
    api.get(`/promotions/store/${storeId}`).then((r) => setItems(r.data));
    api.get(`/products/store/${storeId}`).then((r) => setProducts(r.data));
  };
  useEffect(load, [storeId]);

  const create = async () => {
    setError('');
    try {
      await api.post('/promotions', {
        storeId,
        name: form.name,
        type: form.type,
        value: parseFloat(form.value),
        dateStart: new Date(form.dateStart).toISOString(),
        dateEnd: form.dateEnd ? new Date(form.dateEnd).toISOString() : undefined,
        minQty: parseInt(form.minQty) || 1,
        maxQty: form.maxQty ? parseInt(form.maxQty) : undefined,
        maxUses: form.maxUses ? parseInt(form.maxUses) : undefined,
        productIds: form.productIds,
      });
      setForm({ ...form, name: '', value: '' });
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur');
    }
  };

  const toggle = async (p: any) => {
    await api.put(`/promotions/${p.id}`, { status: p.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' });
    load();
  };
  const remove = async (id: string) => {
    if (!confirm('Supprimer cette promotion ?')) return;
    await api.delete(`/promotions/${id}`);
    load();
  };

  const toggleProduct = (id: string) => {
    setForm((f) => ({ ...f, productIds: f.productIds.includes(id) ? f.productIds.filter((x) => x !== id) : [...f.productIds, id] }));
  };

  const fmtPrice = (p: any) => p.type === 'PERCENT' ? `-${p.value}%` : p.type === 'FIXED' ? `-${p.value} F` : `${p.value} F fixe`;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Promotions</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-green-700 text-white px-4 py-2 rounded text-sm">+ Nouvelle</button>
      </div>

      {showForm && (
        <div className="bg-white p-4 rounded shadow mb-6 space-y-3">
          <input className="border p-2 w-full" placeholder="Nom (ex: Promo Ramadan)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="flex gap-2">
            <select className="border p-2 flex-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="PERCENT">Réduction %</option>
              <option value="FIXED">Réduction fixe (FCFA)</option>
              <option value="PROMO_PRICE">Prix promotionnel</option>
            </select>
            <input className="border p-2 w-28" placeholder="Valeur" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </div>
          <div className="flex gap-2 text-sm">
            <label className="flex-1">Début<input className="border p-2 w-full" type="datetime-local" value={form.dateStart} onChange={(e) => setForm({ ...form, dateStart: e.target.value })} /></label>
            <label className="flex-1">Fin (option)<input className="border p-2 w-full" type="datetime-local" value={form.dateEnd} onChange={(e) => setForm({ ...form, dateEnd: e.target.value })} /></label>
          </div>
          <div className="flex gap-2">
            <input className="border p-2 w-24" placeholder="Qté min" type="number" value={form.minQty} onChange={(e) => setForm({ ...form, minQty: e.target.value })} />
            <input className="border p-2 w-24" placeholder="Qté max" type="number" value={form.maxQty} onChange={(e) => setForm({ ...form, maxQty: e.target.value })} />
            <input className="border p-2 w-24" placeholder="Max uses" type="number" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
          </div>
          <div>
            <p className="text-sm mb-1">Produits concernés (aucun = toute la boutique) :</p>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-auto">
              {products.map((p: any) => (
                <button key={p.id} onClick={() => toggleProduct(p.id)} className={`text-xs px-2 py-1 rounded border ${form.productIds.includes(p.id) ? 'bg-green-700 text-white' : 'bg-gray-50'}`}>{p.name}</button>
              ))}
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button onClick={create} disabled={!form.name || !form.value} className="bg-green-700 text-white px-4 py-2 rounded w-full disabled:bg-gray-300">Créer la promotion</button>
          <p className="text-xs text-gray-500">Le prix final est toujours calculé par le serveur.</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((p) => (
          <div key={p.id} className="bg-white p-4 rounded shadow">
            <div className="flex justify-between items-start gap-2">
              <div>
                <p className="font-bold">{p.name} <span className="text-green-700">{fmtPrice(p)}</span></p>
                <p className="text-xs text-gray-500">
                  {p.expired ? '⏰ Expirée' : p.status === 'PAUSED' ? '⏸ En pause' : '✅ Active'} · {new Date(p.dateStart).toLocaleDateString('fr-FR')}
                  {p.dateEnd ? ` → ${new Date(p.dateEnd).toLocaleDateString('fr-FR')}` : ' → sans fin'}
                  {` · min ${p.minQty}`}{p.maxQty ? ` · max ${p.maxQty}` : ''}{p.maxUses ? ` · ${p.usesCount}/${p.maxUses} utilisations` : ` · ${p.usesCount} utilisations`}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => toggle(p)} className="border px-2 py-1 rounded text-xs">{p.status === 'ACTIVE' ? 'Pause' : 'Activer'}</button>
                <button onClick={() => remove(p.id)} className="border border-red-300 text-red-600 px-2 py-1 rounded text-xs">Suppr.</button>
              </div>
            </div>
          </div>
        ))}
        {!items.length && <p className="text-gray-500 text-sm">Aucune promotion. Créez votre première offre !</p>}
      </div>
    </div>
  );
}
