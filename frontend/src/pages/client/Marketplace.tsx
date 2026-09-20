import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { Link } from 'react-router-dom';

export default function Marketplace() {
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);

  const search = async () => {
    const res = await api.get('/marketplace/products', { params: { q, take: 50 } });
    setProducts(res.data);
    const res2 = await api.get('/marketplace/stores', { params: { q } });
    setStores(res2.data);
  };

  useEffect(()=>{ search(); }, []);

  const addToCart = (p:any)=>{
    if (cart.length && cart[0].storeId !== p.storeId) {
      alert('Panier multi-boutiques non supporté V1 - videz d abord');
      return;
    }
    const existing = cart.find(c=>c.productId===p.id);
    if (existing) setCart(cart.map(c=>c.productId===p.id?{...c, quantity:c.quantity+1}:c));
    else setCart([...cart, { productId:p.id, storeId:p.storeId, name:p.name, quantity:1, price:p.price }]);
  };

  const checkout = async ()=>{
    if (!cart.length) return;
    const storeId = cart[0].storeId;
    const items = cart.map(c=>({ productId:c.productId, quantity:c.quantity }));
    const res = await api.post('/orders', { storeId, items, deliveryType: 'LIVRAISON' });
    alert(`Commande créée ${res.data.orderNumber} - ${res.data.totalAmount} FCFA`);
    setCart([]);
  };

  const nearby = async ()=>{
    if (!navigator.geolocation) { alert('Géoloc non supportée'); return; }
    navigator.geolocation.getCurrentPosition(async pos=>{
      const res = await api.get('/marketplace/products', { params: { lat: pos.coords.latitude, lng: pos.coords.longitude, radiusKm: 10 } });
      setProducts(res.data);
    });
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Marketplace - Acheter près de moi</h1>
      <div className="bg-white p-4 rounded shadow mb-6 flex gap-2">
        <input className="border p-2 flex-1" placeholder="Rechercher produit, boutique..." value={q} onChange={e=>setQ(e.target.value)} />
        <button onClick={search} className="bg-green-700 text-white px-4 rounded">Rechercher</button>
        <button onClick={nearby} className="border px-4 rounded">📍 Près de moi</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h3 className="font-bold mb-2">Produits disponibles (stock réel)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {products.map((p:any)=>(
              <div key={p.id} className="bg-white p-4 rounded shadow">
                <h4 className="font-bold">{p.name}</h4>
                <p className="text-sm text-gray-500">{p.store?.name} {p.distance ? `- ${p.distance.toFixed(1)} km` : ''}</p>
                <p className="font-bold text-green-700">{p.price} FCFA</p>
                <p className="text-xs">Stock: {p.inventories?.[0]?.quantity ?? '?'}</p>
                <button onClick={()=>addToCart(p)} className="mt-2 bg-green-700 text-white px-3 py-1 rounded text-sm">Ajouter panier</button>
                <Link to={`/store/${p.store?.slug}`} className="ml-2 text-sm text-blue-600">Voir boutique</Link>
              </div>
            ))}
          </div>

          <h3 className="font-bold mt-8 mb-2">Boutiques</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {stores.map((s:any)=>(
              <Link key={s.id} to={`/store/${s.slug}`} className="bg-white p-3 rounded shadow hover:shadow-md">
                <p className="font-bold">{s.name}</p>
                <p className="text-xs text-gray-500">{s.category} - {s.quartier}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow h-fit sticky top-4">
          <h3 className="font-bold mb-3">Panier ({cart.length})</h3>
          {cart.map((c:any)=><div key={c.productId} className="flex justify-between text-sm py-1"><span>{c.name} x{c.quantity}</span><span>{c.price*c.quantity}</span></div>)}
          <div className="mt-3 font-bold">Total: {cart.reduce((s,i)=>s+i.quantity*i.price,0)} FCFA</div>
          <button onClick={checkout} disabled={!cart.length} className="mt-4 w-full bg-green-700 text-white p-2 rounded disabled:bg-gray-300">Commander</button>
          <p className="text-xs mt-2 text-gray-500">Stock vérifié côté serveur à la commande. Paiement Wave/OM sandbox disponible après commande.</p>
        </div>
      </div>
    </div>
  );
}
