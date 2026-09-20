import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { Link } from 'react-router-dom';

/** Marketplace V2 : recherche avancée (prix, promo, tri) + favoris. Stock réel servi par le serveur. */
export default function Marketplace() {
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [promo, setPromo] = useState(false);
  const [sort, setSort] = useState('');
  const [favorites, setFavorites] = useState<any[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);

  const isFav = (type: string, id: string) => favorites.some((f) => f.targetType === type && f.targetId === id);

  const loadFavorites = () => {
    api.get('/favorites').then((r) => setFavorites(r.data)).catch(() => {});
  };

  const search = async () => {
    const params: any = { q, take: 50 };
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;
    if (promo) params.promo = 'true';
    if (sort) params.sort = sort;
    const res = await api.get('/marketplace/products', { params });
    setProducts(res.data);
    const res2 = await api.get('/marketplace/stores', { params: { q } });
    setStores(res2.data);
  };

  useEffect(() => { search(); loadFavorites(); }, []);

  const toggleFav = async (type: 'PRODUCT' | 'STORE', id: string) => {
    if (isFav(type, id)) {
      await api.delete(`/favorites/${type}/${id}`);
    } else {
      await api.post('/favorites', { targetType: type, targetId: id });
    }
    loadFavorites();
  };

  const addToCart = (p: any) => {
    if (cart.length && cart[0].storeId !== p.storeId) {
      alert('Panier mono-boutique : videz le panier pour changer de boutique');
      return;
    }
    const existing = cart.find((c) => c.productId === p.id);
    if (existing) setCart(cart.map((c) => (c.productId === p.id ? { ...c, quantity: c.quantity + 1 } : c)));
    else setCart([...cart, { productId: p.id, storeId: p.storeId, name: p.name, quantity: 1, price: p.price }]);
  };

  const checkout = async () => {
    if (!cart.length) return;
    const storeId = cart[0].storeId;
    const items = cart.map((c) => ({ productId: c.productId, quantity: c.quantity }));
    const res = await api.post('/orders', { storeId, items, deliveryType: 'LIVRAISON' });
    alert(`Commande créée ${res.data.orderNumber} - ${res.data.totalAmount} FCFA (prix confirmé serveur)`);
    setCart([]);
  };

  const nearby = async () => {
    if (!navigator.geolocation) { alert('Géoloc non supportée'); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const res = await api.get('/marketplace/products', { params: { lat: pos.coords.latitude, lng: pos.coords.longitude, radiusKm: 10, q: undefined } });
      setProducts(res.data);
    });
  };

  return (
    <div>
      <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
        <h1 className="text-2xl font-bold">Marketplace - Acheter près de moi</h1>
        <button onClick={() => setShowFavorites(!showFavorites)} className="border border-green-700 text-green-700 px-3 py-2 rounded text-sm">
          ♥ Favoris ({favorites.length})
        </button>
      </div>

      {showFavorites && (
        <div className="bg-white p-4 rounded shadow mb-6">
          <h3 className="font-bold mb-2">Mes favoris</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {favorites.filter((f) => f.targetType === 'PRODUCT' && f.product).map((f: any) => (
              <div key={f.id} className="flex justify-between items-center border p-2 rounded text-sm">
                <span>{f.product.name} — {f.product.price} F <span className="text-gray-400">({f.product.storeName})</span></span>
                <button onClick={() => toggleFav('PRODUCT', f.targetId)} className="text-red-500 text-xs">Retirer</button>
              </div>
            ))}
            {favorites.filter((f) => f.targetType === 'STORE' && f.store).map((f: any) => (
              <Link key={f.id} to={`/store/${f.store.slug}`} className="flex justify-between items-center border p-2 rounded text-sm hover:bg-gray-50">
                <span>🏪 {f.store.name}</span>
                <button onClick={(e) => { e.preventDefault(); toggleFav('STORE', f.targetId); }} className="text-red-500 text-xs">Retirer</button>
              </Link>
            ))}
            {!favorites.length && <p className="text-gray-500 text-sm">Aucun favori. Ajoutez-en avec le ♥ !</p>}
          </div>
        </div>
      )}

      <div className="bg-white p-4 rounded shadow mb-6 space-y-3">
        <div className="flex gap-2">
          <input className="border p-2 flex-1" placeholder="Produit, référence, code-barres, boutique..." value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} />
          <button onClick={search} className="bg-green-700 text-white px-4 rounded">Rechercher</button>
          <button onClick={nearby} className="border px-4 rounded">📍 Près de moi</button>
        </div>
        <div className="flex flex-wrap gap-2 text-sm items-center">
          <input className="border p-1 w-24" placeholder="Prix min" type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
          <input className="border p-1 w-24" placeholder="Prix max" type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
          <label className="flex items-center gap-1"><input type="checkbox" checked={promo} onChange={(e) => setPromo(e.target.checked)} /> En promo</label>
          <select className="border p-1" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="">Trier : récent</option>
            <option value="price_asc">Prix croissant</option>
            <option value="price_desc">Prix décroissant</option>
            <option value="name">Nom A→Z</option>
          </select>
          <button onClick={search} className="border px-3 py-1 rounded">Appliquer</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h3 className="font-bold mb-2">Produits disponibles (stock réel)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {products.map((p: any) => (
              <div key={p.id} className="bg-white p-4 rounded shadow">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold">{p.name}</h4>
                  <button onClick={() => toggleFav('PRODUCT', p.id)} className={`text-xl ${isFav('PRODUCT', p.id) ? 'text-red-500' : 'text-gray-300'}`}>♥</button>
                </div>
                <p className="text-sm text-gray-500">{p.store?.name} {p.distance ? `- ${p.distance.toFixed(1)} km` : ''}</p>
                <p className="font-bold text-green-700">{p.price} FCFA</p>
                <p className="text-xs">Stock: {p.inventories?.[0]?.quantity ?? '?'}</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => addToCart(p)} className="bg-green-700 text-white px-3 py-1 rounded text-sm">Ajouter panier</button>
                  <Link to={`/store/${p.store?.slug}`} className="text-sm text-blue-600 py-1">Voir boutique</Link>
                </div>
              </div>
            ))}
          </div>

          <h3 className="font-bold mt-8 mb-2">Boutiques</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {stores.map((s: any) => (
              <div key={s.id} className="bg-white p-3 rounded shadow relative hover:shadow-md">
                <button onClick={() => toggleFav('STORE', s.id)} className={`absolute top-2 right-2 text-lg ${isFav('STORE', s.id) ? 'text-red-500' : 'text-gray-300'}`}>♥</button>
                <Link to={`/store/${s.slug}`}>
                  <p className="font-bold">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.category} - {s.quartier}</p>
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded shadow h-fit sticky top-4">
          <h3 className="font-bold mb-3">Panier ({cart.length})</h3>
          {cart.map((c: any) => <div key={c.productId} className="flex justify-between text-sm py-1"><span>{c.name} x{c.quantity}</span><span>{c.price * c.quantity}</span></div>)}
          <div className="mt-3 font-bold">Total: {cart.reduce((s, i) => s + i.quantity * i.price, 0)} FCFA</div>
          <button onClick={checkout} disabled={!cart.length} className="mt-4 w-full bg-green-700 text-white p-2 rounded disabled:bg-gray-300">Commander</button>
          <p className="text-xs mt-2 text-gray-500">Stock, prix et remises vérifiés côté serveur à la commande.</p>
        </div>
      </div>
    </div>
  );
}
