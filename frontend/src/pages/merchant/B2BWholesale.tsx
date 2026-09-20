import { useEffect, useState } from 'react';
import api from '../../lib/api';

/** LOT D — B2B côté grossiste : catalogue professionnel + commandes reçues (mobile-first). */
export default function B2BWholesale() {
  const [profile, setProfile] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [catalogs, setCatalogs] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState<any>({ type: 'WHOLESALER', companyName: '', ninea: '', phone: '' });
  const [catForm, setCatForm] = useState<any>({ name: '', minOrderAmount: 0, description: '' });
  const [itemForm, setItemForm] = useState<any>({ productId: '', proPrice: 0, minQty: 1 });

  const load = () => {
    api.get('/b2b/profile/me').then((r) => setProfile(r.data)).catch(() => {});
    api.get('/b2b/catalogs/mine').then((r) => setCatalogs(r.data)).catch(() => {});
    api.get('/b2b/orders?role=wholesaler').then((r) => setOrders(r.data)).catch(() => {});
    api.get('/stores/my').then((r) => {
      setStores(r.data);
      if (r.data[0]) loadProducts(r.data[0].id);
    }).catch(() => {});
  };
  useEffect(load, []);
  const loadProducts = (storeId: string) => {
    api.get(`/products?storeId=${storeId}`).then((r) => setProducts(r.data)).catch(() => {});
  };

  const saveProfile = async () => {
    try { await api.post('/b2b/profile', form); setMsg('✅ Profil B2B enregistré.'); load(); }
    catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };
  const createCatalog = async () => {
    try { await api.post('/b2b/catalogs', catForm); setMsg('✅ Catalogue créé.'); setCatForm({ name: '', minOrderAmount: 0, description: '' }); load(); }
    catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };
  const addItem = async (catalogId: string) => {
    try { await api.post(`/b2b/catalogs/${catalogId}/items`, itemForm); setMsg('✅ Produit ajouté au catalogue.'); load(); }
    catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };
  const nextAction: Record<string, { s: string; l: string } | undefined> = {
    ENVOYEE: { s: 'ACCEPTEE', l: 'Accepter' },
    ACCEPTEE: { s: 'PREPARATION', l: 'Préparer' },
    PREPARATION: { s: 'PRETE', l: 'Marquer prête' },
    PRETE: { s: 'EXPEDIEE', l: 'Expédier' },
  };
  const setStatus = async (id: string, status: string) => {
    try { await api.patch(`/b2b/orders/${id}/status`, { status }); load(); }
    catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };

  if (!profile) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Espace grossiste / fournisseur</h1>
        {msg && <p className="bg-blue-50 border p-2 rounded mb-4 text-sm">{msg}</p>}
        <p className="text-sm text-gray-600 mb-3">Créez votre profil pour publier des catalogues professionnels et recevoir des commandes de commerçants.</p>
        <div className="bg-white p-4 rounded shadow space-y-3">
          <input className="border p-2 w-full" placeholder="Raison sociale" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          <select className="border p-2 w-full" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="WHOLESALER">Grossiste</option>
            <option value="SUPPLIER">Fournisseur</option>
            <option value="BOTH">Les deux</option>
          </select>
          <input className="border p-2 w-full" placeholder="NINEA (optionnel)" value={form.ninea} onChange={(e) => setForm({ ...form, ninea: e.target.value })} />
          <input className="border p-2 w-full" placeholder="Téléphone (optionnel)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <button className="w-full bg-blue-600 text-white p-3 rounded font-bold" onClick={saveProfile}>Créer mon profil B2B</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Espace grossiste</h1>
      <p className="text-sm text-gray-600 mb-4">{profile.companyName} · {profile.type}</p>
      {msg && <p className="bg-green-50 border border-green-200 text-green-800 p-2 rounded mb-4 text-sm">{msg}</p>}

      <h2 className="font-bold mb-2">Mes catalogues professionnels</h2>
      <div className="bg-white p-4 rounded shadow mb-4 space-y-2">
        <input className="border p-2 w-full" placeholder="Nom du catalogue" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
        <input className="border p-2 w-full" type="number" min="0" placeholder="Montant minimum de commande (FCFA)" value={catForm.minOrderAmount} onChange={(e) => setCatForm({ ...catForm, minOrderAmount: parseInt(e.target.value) || 0 })} />
        <button className="w-full bg-blue-600 text-white p-3 rounded font-bold" onClick={createCatalog}>Créer un catalogue</button>
      </div>
      {catalogs.map((c: any) => (
        <div key={c.id} className="bg-white p-4 rounded shadow mb-4">
          <p className="font-bold">{c.name}</p>
          <p className="text-xs text-gray-500 mb-2">Minimum : {c.minOrderAmount} FCFA</p>
          <select className="border p-2 w-full mb-2" value={itemForm.productId} onChange={(e) => setItemForm({ ...itemForm, productId: e.target.value })}>
            <option value="">Ajouter un produit…</option>
            {products.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.sku || 'sans SKU'})</option>)}
          </select>
          <div className="flex gap-2 mb-2">
            <input className="border p-2 flex-1" type="number" min="1" placeholder="Prix pro" value={itemForm.proPrice} onChange={(e) => setItemForm({ ...itemForm, proPrice: parseInt(e.target.value) || 0 })} />
            <input className="border p-2 w-24" type="number" min="1" placeholder="Qté min" value={itemForm.minQty} onChange={(e) => setItemForm({ ...itemForm, minQty: parseInt(e.target.value) || 1 })} />
            <button className="bg-gray-800 text-white px-3 rounded" onClick={() => addItem(c.id)}>+</button>
          </div>
          <p className="text-xs text-gray-500">Sélectionnez d'abord une boutique ci-dessus pour lister ses produits.</p>
          {stores.length > 1 && (
            <select className="border p-2 w-full mb-2" onChange={(e) => loadProducts(e.target.value)}>
              {stores.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>
      ))}

      <h2 className="font-bold mb-2">Commandes reçues</h2>
      {orders.length === 0 && <p className="text-sm text-gray-500">Aucune commande pour le moment.</p>}
      {orders.map((o: any) => (
        <div key={o.id} className="bg-white p-4 rounded shadow mb-3">
          <div className="flex justify-between items-center">
            <p className="font-bold">{o.orderNumber}</p>
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{o.status}</span>
          </div>
          <p className="text-sm">{o.totalAmount} FCFA</p>
          {nextAction[o.status] && (
            <button className="mt-2 w-full bg-green-600 text-white p-2 rounded text-sm font-bold" onClick={() => setStatus(o.id, nextAction[o.status]!.s)}>
              {nextAction[o.status]!.l}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
