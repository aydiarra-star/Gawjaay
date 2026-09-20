import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../lib/api';

/**
 * Fournisseurs & réceptions (cahier §10) : les fournisseurs appartiennent au commerçant (toutes boutiques),
 * une réception d'achat entre le stock de LA boutique courante (mouvement PURCHASE_RECEIPT côté serveur).
 */
export default function Suppliers() {
  const { storeId } = useParams();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' });
  const [msg, setMsg] = useState('');
  const [receiving, setReceiving] = useState<string>('');
  const [lines, setLines] = useState<Array<{ productId: string; quantity: string; unitPrice: string }>>([{ productId: '', quantity: '', unitPrice: '' }]);
  const [notes, setNotes] = useState('');

  const load = () => {
    api.get('/suppliers').then((r) => setSuppliers(r.data)).catch(() => setSuppliers([]));
    api.get(`/suppliers/purchases/store/${storeId}`).then((r) => setPurchases(r.data)).catch(() => setPurchases([]));
    api.get(`/products/store/${storeId}`).then((r) => setProducts(r.data)).catch(() => setProducts([]));
  };
  useEffect(() => { load(); }, [storeId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.post('/suppliers', {
        name: form.name.trim(), phone: form.phone.trim() || undefined, email: form.email.trim() || undefined,
        address: form.address.trim() || undefined, notes: form.notes.trim() || undefined,
      });
      setForm({ name: '', phone: '', email: '', address: '', notes: '' });
      setMsg('Fournisseur créé.');
      load();
    } catch (err: any) { setMsg(err.response?.data?.error || 'Création refusée'); }
  };

  const receive = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = lines
      .filter((l) => l.productId && Number(l.quantity) > 0)
      .map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice || 0) }));
    if (!items.length) { setMsg('Ajoutez au moins une ligne (produit + quantité > 0).'); return; }
    setMsg('');
    try {
      await api.post(`/suppliers/${receiving}/receive`, { storeId, items, notes: notes.trim() || undefined });
      setLines([{ productId: '', quantity: '', unitPrice: '' }]); setNotes(''); setReceiving('');
      setMsg('Réception enregistrée : stock incrémenté par le serveur (mouvement PURCHASE_RECEIPT).');
      load();
    } catch (err: any) { setMsg(err.response?.data?.error || 'Réception refusée'); }
  };

  const setLine = (i: number, patch: Partial<{ productId: string; quantity: string; unitPrice: string }>) =>
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const fmt = (n: any) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h1 className="text-xl font-bold">Fournisseurs & réceptions</h1>
        <Link to="/merchant" className="text-green-700 text-sm">← Mes boutiques</Link>
      </div>
      {msg && <p className="text-sm text-gray-700 mb-3 bg-gray-50 p-2 rounded" role="status">{msg}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <form onSubmit={create} className="bg-white p-4 rounded shadow text-sm space-y-2">
            <h3 className="font-bold">Nouveau fournisseur</h3>
            <input className="border p-2 rounded w-full" placeholder="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <div className="grid grid-cols-2 gap-2">
              <input className="border p-2 rounded" type="tel" placeholder="Téléphone +221... (optionnel)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input className="border p-2 rounded" type="email" placeholder="Email (optionnel)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <input className="border p-2 rounded w-full" placeholder="Adresse (optionnel)" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <input className="border p-2 rounded w-full" placeholder="Notes (optionnel)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            <button className="bg-green-700 text-white px-4 py-2 rounded">Créer le fournisseur</button>
          </form>

          <div className="bg-white p-4 rounded shadow text-sm">
            <h3 className="font-bold mb-2">Mes fournisseurs ({suppliers.length})</h3>
            {!suppliers.length && <p className="text-gray-500">Aucun fournisseur.</p>}
            {suppliers.map((s: any) => (
              <div key={s.id} className="border-b py-2 flex flex-wrap justify-between gap-2">
                <span><span className="font-semibold">{s.name}</span>{s.phone ? ` · ${s.phone}` : ''}{s.email ? ` · ${s.email}` : ''}</span>
                <button onClick={() => setReceiving(receiving === s.id ? '' : s.id)} className="border border-green-700 text-green-700 px-2 py-1 rounded text-xs">
                  {receiving === s.id ? 'Fermer' : 'Réceptionner un achat'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {receiving && (
            <form onSubmit={receive} className="bg-white p-4 rounded shadow text-sm space-y-2">
              <h3 className="font-bold">Réception — {suppliers.find((s) => s.id === receiving)?.name}</h3>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-5 gap-1">
                  <select className="border p-1 rounded col-span-3" value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })} aria-label="Produit">
                    <option value="">— produit —</option>
                    {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input className="border p-1 rounded" type="number" min="0.001" step="any" placeholder="Qté" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} aria-label="Quantité" />
                  <input className="border p-1 rounded" type="number" min="0" step="any" placeholder="PU achat" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} aria-label="Prix unitaire" />
                </div>
              ))}
              <div className="flex gap-2">
                <button type="button" onClick={() => setLines([...lines, { productId: '', quantity: '', unitPrice: '' }])} className="border px-2 py-1 rounded text-xs">+ ligne</button>
                <input className="border p-1 rounded flex-1" placeholder="Notes (n° bon, etc.)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <button className="bg-green-700 text-white px-4 py-2 rounded">Valider la réception (entrée en stock)</button>
            </form>
          )}

          <div className="bg-white p-4 rounded shadow text-sm">
            <h3 className="font-bold mb-2">Réceptions récentes ({purchases.length})</h3>
            {!purchases.length && <p className="text-gray-500">Aucune réception pour cette boutique.</p>}
            {purchases.map((p: any) => (
              <div key={p.id} className="border-b py-2">
                <div className="flex justify-between"><span className="font-semibold">{p.supplierName}</span><span>{fmt(p.totalAmount)}</span></div>
                <p className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleString('fr-FR')}{p.notes ? ` · ${p.notes}` : ''}</p>
                <p className="text-xs text-gray-600">{(p.items || []).map((it: any) => `${it.productName || it.productId} ×${it.quantity} @ ${it.unitPrice}`).join(', ')}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
