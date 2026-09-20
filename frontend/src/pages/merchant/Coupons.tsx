import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

/** LOT A — Page Coupons du marchand (mobile-first). */
export default function Coupons() {
  const { storeId } = useParams();
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ code: '', type: 'PERCENT', value: '', dateEnd: '', maxUses: '', perClientLimit: '1', minOrderAmount: '0' });
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = () => api.get(`/coupons/store/${storeId}`).then((r) => setItems(r.data));
  useEffect(() => { load(); }, [storeId]);

  const create = async () => {
    setError('');
    try {
      await api.post('/coupons', {
        storeId,
        code: form.code,
        type: form.type,
        value: parseFloat(form.value),
        dateEnd: form.dateEnd ? new Date(form.dateEnd).toISOString() : undefined,
        maxUses: form.maxUses ? parseInt(form.maxUses) : undefined,
        perClientLimit: parseInt(form.perClientLimit) || 1,
        minOrderAmount: parseFloat(form.minOrderAmount) || 0,
      });
      setForm({ ...form, code: '', value: '' });
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur');
    }
  };

  const toggle = async (c: any) => {
    await api.put(`/coupons/${c.id}`, { isActive: !c.isActive });
    load();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Coupons</h1>
        <button onClick={() => setShowForm(!showForm)} className="bg-green-700 text-white px-4 py-2 rounded text-sm">+ Nouveau</button>
      </div>

      {showForm && (
        <div className="bg-white p-4 rounded shadow mb-6 space-y-3">
          <input className="border p-2 w-full uppercase" placeholder="CODE (ex: GAWJAAY10)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          <div className="flex gap-2">
            <select className="border p-2 flex-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="PERCENT">Réduction %</option>
              <option value="FIXED">Réduction fixe (FCFA)</option>
            </select>
            <input className="border p-2 w-28" placeholder="Valeur" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <input className="border p-2 w-28" placeholder="Max uses" type="number" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
            <input className="border p-2 w-28" placeholder="Fois/client" type="number" value={form.perClientLimit} onChange={(e) => setForm({ ...form, perClientLimit: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <input className="border p-2 flex-1" placeholder="Montant min (FCFA)" type="number" value={form.minOrderAmount} onChange={(e) => setForm({ ...form, minOrderAmount: e.target.value })} />
            <input className="border p-2 flex-1" type="datetime-local" value={form.dateEnd} onChange={(e) => setForm({ ...form, dateEnd: e.target.value })} />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button onClick={create} disabled={!form.code || !form.value} className="bg-green-700 text-white px-4 py-2 rounded w-full disabled:bg-gray-300">Créer le coupon</button>
          <p className="text-xs text-gray-500">Validation serveur, anti-double utilisation, historique complet.</p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((c) => (
          <div key={c.id} className="bg-white p-4 rounded shadow flex justify-between items-center">
            <div>
              <p className="font-bold font-mono">{c.code} <span className="text-green-700">{c.type === 'PERCENT' ? `-${c.value}%` : `-${c.value} F`}</span></p>
              <p className="text-xs text-gray-500">
                {c.isActive ? '✅ Actif' : '⛔ Inactif'} · {c.usesCount}/{c.maxUses ?? '∞'} utilisations · {c.redemptionCount} rédemptions
                {c.minOrderAmount > 0 ? ` · min ${c.minOrderAmount} F` : ''}
                {c.dateEnd ? ` · fin ${new Date(c.dateEnd).toLocaleDateString('fr-FR')}` : ''}
              </p>
            </div>
            <button onClick={() => toggle(c)} className="border px-2 py-1 rounded text-xs">{c.isActive ? 'Désactiver' : 'Activer'}</button>
          </div>
        ))}
        {!items.length && <p className="text-gray-500 text-sm">Aucun coupon.</p>}
      </div>
    </div>
  );
}
