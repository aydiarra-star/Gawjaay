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
      <Link to={`/merchant/store/${storeId}/employees`} className="block text-green-700">→ Employés</Link>
      <Link to={`/merchant/store/${storeId}/promotions`} className="block text-green-700">→ Promotions</Link>
      <Link to={`/merchant/store/${storeId}/coupons`} className="block text-green-700">→ Coupons</Link>
      <Link to={`/merchant/store/${storeId}/reviews`} className="block text-green-700">→ Avis clients</Link>
      <Link to={`/merchant/store/${storeId}/analytics`} className="block text-green-700">→ Analytics & exports</Link>
      <Link to={`/merchant/store/${storeId}/inventory-count`} className="block text-green-700">→ Inventaire (comptage)</Link>
      <Link to={`/merchant/store/${storeId}/loyalty`} className="block text-green-700">→ Fidélité</Link>
    </div>
  );
}

function ProductManager({ storeId, products, setProducts }: any) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');

  const add = async () => {
    if (!name || !price) return;
    const res = await api.post(`/products/store/${storeId}`, { name, price: parseFloat(price), initialStock: parseFloat(stock)||0 });
    setProducts([res.data, ...products]);
    setName(''); setPrice(''); setStock('');
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input className="border p-2 flex-1" placeholder="Nom produit" value={name} onChange={e=>setName(e.target.value)} />
        <input className="border p-2 w-24" placeholder="Prix" value={price} onChange={e=>setPrice(e.target.value)} />
        <input className="border p-2 w-20" placeholder="Stock" value={stock} onChange={e=>setStock(e.target.value)} />
        <button onClick={add} className="bg-green-700 text-white px-3 rounded">+</button>
      </div>
      <div className="space-y-2 max-h-96 overflow-auto">
        {products.map((p:any)=>(
          <div key={p.id} className="flex justify-between border-b py-2 text-sm">
            <span>{p.name} - {p.price} FCFA</span>
            <span className="text-gray-500">Stock: {p.inventories?.[0]?.quantity ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
