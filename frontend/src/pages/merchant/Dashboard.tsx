import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { Link } from 'react-router-dom';

export default function MerchantDashboard() {
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState<any>(null);
  const [dash, setDash] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [newStoreName, setNewStoreName] = useState('');

  useEffect(() => {
    api.get('/stores/my').then(r=>setStores(r.data));
  }, []);

  useEffect(() => {
    if (selectedStore) {
      api.get(`/dashboard/store/${selectedStore.id}`).then(r=>setDash(r.data));
      api.get(`/products/store/${selectedStore.id}`).then(r=>setProducts(r.data));
    }
  }, [selectedStore]);

  const createStore = async () => {
    if (!newStoreName) return;
    const res = await api.post('/stores', { name: newStoreName });
    setStores([...stores, res.data]);
    setNewStoreName('');
  };

  if (!selectedStore) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Mes Boutiques</h1>
        <div className="bg-white p-4 rounded shadow mb-6 flex gap-2">
          <input className="border p-2 flex-1" placeholder="Nom nouvelle boutique" value={newStoreName} onChange={e=>setNewStoreName(e.target.value)} />
          <button onClick={createStore} className="bg-green-700 text-white px-4 rounded">Créer</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stores.map(s=>(
            <div key={s.id} className="bg-white p-4 rounded shadow">
              <h3 className="font-bold">{s.name}</h3>
              <p className="text-sm text-gray-500">{s.slug}</p>
              <p className="text-xs mt-2">Physique: {s.physicalStatus} | Digital: {s.digitalStatus}</p>
              <div className="mt-3 flex gap-2">
                <button onClick={()=>setSelectedStore(s)} className="bg-green-700 text-white px-3 py-1 rounded text-sm">Gérer</button>
                <Link to={`/store/${s.slug}`} className="border px-3 py-1 rounded text-sm">Voir boutique publique</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={()=>setSelectedStore(null)} className="mb-4 text-green-700">← Retour boutiques</button>
      <h1 className="text-2xl font-bold">{selectedStore.name}</h1>
      <p className="text-sm text-gray-500 mb-4">Lien public: <a href={`/store/${selectedStore.slug}`} className="text-blue-600">/store/{selectedStore.slug}</a> | WhatsApp partageable</p>

      {dash && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded shadow"><p className="text-sm">Ventes aujourd'hui</p><p className="text-xl font-bold">{dash.today.salesAmount} FCFA</p><p className="text-xs">{dash.today.salesCount} ventes</p></div>
          <div className="bg-white p-4 rounded shadow"><p className="text-sm">Commandes en attente</p><p className="text-xl font-bold">{dash.today.ordersPending}</p></div>
          <div className="bg-white p-4 rounded shadow"><p className="text-sm">Stock faible</p><p className="text-xl font-bold">{dash.today.lowStock}</p></div>
          <div className="bg-white p-4 rounded shadow"><p className="text-sm">Dettes</p><p className="text-xl font-bold">{dash.today.debts.total} FCFA</p><p className="text-xs">{dash.today.debts.count} clients</p></div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-3">Produits ({products.length})</h3>
          <ProductManager storeId={selectedStore.id} products={products} setProducts={setProducts} />
        </div>
        <div className="space-y-4">
          <QuickLinks storeId={selectedStore.id} />
        </div>
      </div>
    </div>
  );
}

function QuickLinks({ storeId }: { storeId: string }) {
  return (
    <div className="bg-white p-4 rounded shadow space-y-2">
      <h4 className="font-bold">Actions rapides</h4>
      <Link to={`/merchant/store/${storeId}/sales`} className="block text-green-700">→ Ventes physiques</Link>
      <Link to={`/merchant/store/${storeId}/orders`} className="block text-green-700">→ Commandes en ligne</Link>
      <Link to={`/merchant/store/${storeId}/inventory`} className="block text-green-700">→ Stock & alertes</Link>
      <Link to={`/merchant/store/${storeId}/customers`} className="block text-green-700">→ Clients & dettes</Link>
      <Link to={`/merchant/store/${storeId}/expenses`} className="block text-green-700">→ Dépenses</Link>
      <Link to={`/merchant/store/${storeId}/suppliers`} className="block text-green-700">→ Fournisseurs & réceptions</Link>
      <Link to={`/merchant/store/${storeId}/employees`} className="block text-green-700">→ Employés & permissions</Link>
      <Link to={`/merchant/store/${storeId}/settings`} className="block text-green-700">→ Paramètres boutique (horaires, contact, zone, livraison)</Link>
      <Link to={`/merchant/store/${storeId}/promotions`} className="block text-green-700">→ Promotions</Link>
      <Link to={`/merchant/store/${storeId}/coupons`} className="block text-green-700">→ Coupons</Link>
      <Link to={`/merchant/store/${storeId}/reviews`} className="block text-green-700">→ Avis clients</Link>
      <Link to={`/merchant/store/${storeId}/analytics`} className="block text-green-700">→ Analytics & exports</Link>
      <Link to={`/merchant/store/${storeId}/inventory-count`} className="block text-green-700">→ Inventaire (comptage)</Link>
      <Link to={`/merchant/store/${storeId}/loyalty`} className="block text-green-700">→ Fidélité</Link>

      <Link to={`/merchant/store/${storeId}/assistant`} className="block bg-white p-4 rounded shadow mb-3"><span className="font-bold">Assistant IA</span><br /><span className="text-sm text-gray-600">Questions sur vos données réelles + actions confirmées</span></Link>

      <Link to={`/merchant/store/${storeId}/deliveries`} className="block bg-white p-4 rounded shadow mb-3"><span className="font-bold">Livraisons</span><br /><span className="text-sm text-gray-600">Livreurs, courses et preuves</span></Link>

      <Link to="/merchant/b2b" className="block bg-white p-4 rounded shadow mb-3"><span className="font-bold">Grossiste B2B</span><br /><span className="text-sm text-gray-600">Catalogues pro et commandes reçues</span></Link>

      <Link to="/merchant/b2b/orders" className="block bg-white p-4 rounded shadow mb-3"><span className="font-bold">Commander en gros</span><br /><span className="text-sm text-gray-600">Catalogues fournisseurs et suivi</span></Link>

      <Link to={`/merchant/store/${storeId}/replenishment`} className="block bg-white p-4 rounded shadow mb-3"><span className="font-bold">Réapprovisionnement</span><br /><span className="text-sm text-gray-600">Suggestions basées sur le stock réel</span></Link>
    </div>
  );
}

function ProductManager({ storeId, products, setProducts }: any) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => { api.get('/categories').then((r) => setCategories(r.data)).catch(() => setCategories([])); }, []);

  const add = async () => {
    if (!name || !price) return;
    setMsg('');
    try {
      const res = await api.post(`/products/store/${storeId}`, { name, price: parseFloat(price), initialStock: parseFloat(stock)||0 });
      setProducts([res.data, ...products]);
      setName(''); setPrice(''); setStock('');
    } catch (err: any) { setMsg(err.response?.data?.error || 'Création refusée'); }
  };

  const startEdit = (p: any) => setEditing({
    id: p.id, name: p.name || '', price: p.price ?? '', costPrice: p.costPrice ?? '', categoryId: p.categoryId || '',
    sku: p.sku || '', barcode: p.barcode || '', unit: p.unit || '', lowStockThreshold: p.lowStockThreshold ?? '',
    description: p.description || '', isOnline: p.isOnline !== 0 && p.isOnline !== false, isActive: p.isActive !== 0 && p.isActive !== false,
  });

  const saveEdit = async () => {
    if (!editing) return;
    setMsg('');
    const num = (v: any) => (v === '' || v === null || v === undefined ? undefined : Number(v));
    const payload: any = {
      name: editing.name.trim(), price: num(editing.price), costPrice: num(editing.costPrice), categoryId: editing.categoryId || null,
      sku: editing.sku.trim() || null, barcode: editing.barcode.trim() || null, unit: editing.unit.trim() || undefined,
      lowStockThreshold: num(editing.lowStockThreshold), description: editing.description.trim() || undefined,
      isOnline: !!editing.isOnline, isActive: !!editing.isActive,
    };
    try {
      const res = await api.put(`/products/${editing.id}`, payload);
      setProducts(products.map((p: any) => (p.id === editing.id ? { ...p, ...res.data } : p)));
      setEditing(null);
    } catch (err: any) { setMsg(err.response?.data?.error || 'Modification refusée'); }
  };

  const toggleOnline = async (p: any) => {
    const isOnline = !(p.isOnline !== 0 && p.isOnline !== false);
    try {
      const res = await api.put(`/products/${p.id}`, { isOnline });
      setProducts(products.map((x: any) => (x.id === p.id ? { ...x, ...res.data } : x)));
    } catch (err: any) { setMsg(err.response?.data?.error || 'Modification refusée'); }
  };

  const catName = (id: string) => categories.find((c) => c.id === id)?.name;

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input className="border p-2 flex-1" placeholder="Nom produit" value={name} onChange={e=>setName(e.target.value)} />
        <input className="border p-2 sm:w-24" placeholder="Prix" type="number" min="0" step="any" value={price} onChange={e=>setPrice(e.target.value)} />
        <input className="border p-2 sm:w-20" placeholder="Stock" type="number" min="0" step="any" value={stock} onChange={e=>setStock(e.target.value)} />
        <button onClick={add} className="bg-green-700 text-white px-3 py-2 rounded">+</button>
      </div>
      {msg && <p className="text-xs text-red-700 mb-2" role="alert">{msg}</p>}
      <div className="space-y-2 max-h-[32rem] overflow-auto">
        {products.map((p:any)=>(
          <div key={p.id} className="border-b py-2 text-sm">
            {editing?.id === p.id ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <input className="border p-1 col-span-2" value={editing.name} onChange={(e)=>setEditing({ ...editing, name: e.target.value })} placeholder="Nom" />
                <input className="border p-1" type="number" min="0" step="any" value={editing.price} onChange={(e)=>setEditing({ ...editing, price: e.target.value })} placeholder="Prix de vente" />
                <input className="border p-1" type="number" min="0" step="any" value={editing.costPrice} onChange={(e)=>setEditing({ ...editing, costPrice: e.target.value })} placeholder="Prix d'achat" />
                <select className="border p-1 col-span-2" value={editing.categoryId} onChange={(e)=>setEditing({ ...editing, categoryId: e.target.value })}>
                  <option value="">Sans catégorie</option>
                  {categories.map((c)=> <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input className="border p-1" value={editing.sku} onChange={(e)=>setEditing({ ...editing, sku: e.target.value })} placeholder="Référence (SKU)" />
                <input className="border p-1" value={editing.barcode} onChange={(e)=>setEditing({ ...editing, barcode: e.target.value })} placeholder="Code-barres" />
                <input className="border p-1" value={editing.unit} onChange={(e)=>setEditing({ ...editing, unit: e.target.value })} placeholder="Unité (pièce, kg…)" />
                <input className="border p-1" type="number" min="0" value={editing.lowStockThreshold} onChange={(e)=>setEditing({ ...editing, lowStockThreshold: e.target.value })} placeholder="Seuil alerte" />
                <input className="border p-1 col-span-2" value={editing.description} onChange={(e)=>setEditing({ ...editing, description: e.target.value })} placeholder="Description" />
                <label className="flex items-center gap-1"><input type="checkbox" checked={editing.isOnline} onChange={(e)=>setEditing({ ...editing, isOnline: e.target.checked })} /> En ligne</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={editing.isActive} onChange={(e)=>setEditing({ ...editing, isActive: e.target.checked })} /> Actif</label>
                <div className="col-span-2 md:col-span-4 flex gap-2">
                  <button onClick={saveEdit} className="bg-green-700 text-white px-3 py-1 rounded text-xs">Enregistrer</button>
                  <button onClick={()=>setEditing(null)} className="border px-3 py-1 rounded text-xs">Annuler</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap justify-between gap-2 items-center">
                <span>
                  {p.name} - {p.price} FCFA
                  {p.categoryId && catName(p.categoryId) ? <span className="text-gray-400"> · {catName(p.categoryId)}</span> : null}
                  {(p.isOnline === 0 || p.isOnline === false) && <span className="ml-1 text-xs bg-gray-200 px-1 rounded">hors ligne</span>}
                  {(p.isActive === 0 || p.isActive === false) && <span className="ml-1 text-xs bg-red-100 text-red-700 px-1 rounded">inactif</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-gray-500">Stock: {p.inventories?.[0]?.quantity ?? 0}</span>
                  <button onClick={()=>toggleOnline(p)} className="border px-2 py-0.5 rounded text-xs">{(p.isOnline === 0 || p.isOnline === false) ? 'Mettre en ligne' : 'Retirer du web'}</button>
                  <button onClick={()=>startEdit(p)} className="text-green-700 text-xs">Modifier</button>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
