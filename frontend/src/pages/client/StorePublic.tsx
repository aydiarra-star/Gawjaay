import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

/** Estimation affichage d'un prix promo — le prix final est TOUJOURS recalculé par le serveur. */
function displayPrice(p: any, promos: any[]): number {
  let best = p.price;
  for (const promo of promos) {
    if (promo.productIds?.length && !promo.productIds.includes(p.id)) continue;
    let candidate = p.price;
    if (promo.type === 'PERCENT') candidate = Math.round(p.price * (1 - Math.min(promo.value, 100) / 100));
    else if (promo.type === 'FIXED') candidate = Math.max(0, p.price - promo.value);
    else if (promo.type === 'PROMO_PRICE') candidate = Math.min(p.price, promo.value);
    if (candidate < best) best = candidate;
  }
  return best;
}

export default function StorePublic() {
  const { slug } = useParams();
  const [store, setStore] = useState<any>(null);
  const [cart, setCart] = useState<any[]>([]);
  const [promos, setPromos] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any>({ reviews: [], stats: { count: 0, average: null } });
  const [couponCode, setCouponCode] = useState('');
  const [couponInfo, setCouponInfo] = useState<any>(null);
  const [couponError, setCouponError] = useState('');
  const [deliveryType, setDeliveryType] = useState('LIVRAISON');

  useEffect(() => {
    api.get(`/stores/slug/${slug}`).then((r) => {
      setStore(r.data);
      api.get(`/promotions/store/${r.data.id}/active`).then((x) => setPromos(x.data)).catch(() => {});
      api.get(`/reviews/store/${r.data.id}`).then((x) => setReviews(x.data)).catch(() => {});
    });
  }, [slug]);

  if (!store) return <div>Chargement...</div>;

  const priceOf = (p: any) => displayPrice(p, promos);
  const subtotal = cart.reduce((s, i) => s + i.quantity * priceOf(i.product), 0);
  const fees = deliveryType === 'LIVRAISON' ? (store.deliveryFees || 0) : 0;

  const add = (p: any) => {
    const ex = cart.find((c) => c.productId === p.id);
    if (ex) setCart(cart.map((c) => (c.productId === p.id ? { ...c, quantity: c.quantity + 1 } : c)));
    else setCart([...cart, { productId: p.id, product: p, quantity: 1 }]);
  };

  const checkCoupon = async () => {
    setCouponError(''); setCouponInfo(null);
    try {
      const r = await api.post('/coupons/validate', { storeId: store.id, code: couponCode, subtotal });
      if (r.data.ok) setCouponInfo(r.data);
      else setCouponError(r.data.reason || 'Coupon invalide');
    } catch (e: any) {
      setCouponError(e.response?.data?.error || 'Erreur');
    }
  };

  const order = async () => {
    const res = await api.post('/orders', {
      storeId: store.id,
      items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
      deliveryType,
      couponCode: couponInfo ? couponCode : undefined,
    });
    const promoSaved = res.data.discount > 0 ? ` (dont ${res.data.discount} F de remise)` : '';
    alert(`Commande ${res.data.orderNumber} créée - ${res.data.totalAmount} FCFA${promoSaved}`);
    setCart([]); setCouponInfo(null); setCouponCode('');
  };

  const whatsappLink = `https://wa.me/?text=${encodeURIComponent(`Découvre ma boutique ${store.name} sur GawJaay: ${window.location.href}`)}`;

  return (
    <div>
      <div className="bg-white p-6 rounded shadow mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold">{store.name}</h1>
          {reviews.stats.count > 0 && (
            <span className="text-sm bg-yellow-50 border border-yellow-200 px-2 py-1 rounded">
              ★ {reviews.stats.average}/5 ({reviews.stats.count} avis)
            </span>
          )}
        </div>
        <p className="text-gray-600">{store.description}</p>
        <p className="text-sm mt-2">{store.addressText} - {store.quartier} | Livraison: {store.deliveryFees} FCFA | {store.allowPickup ? 'Retrait possible' : ''}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={whatsappLink} target="_blank" className="bg-green-500 text-white px-4 py-2 rounded">Partager WhatsApp</a>
          <button onClick={() => navigator.clipboard.writeText(window.location.href)} className="border px-4 py-2 rounded">Copier lien</button>
        </div>
        <p className="mt-2 text-xs">Statut physique: {store.physicalStatus} | Boutique en ligne: {store.digitalStatus}</p>
      </div>

      {promos.length > 0 && (
        <div className="bg-green-50 border border-green-200 p-4 rounded mb-6">
          <h3 className="font-bold text-green-800 mb-1">🎉 Promotions en cours</h3>
          {promos.map((p) => (
            <p key={p.id} className="text-sm text-green-800">
              {p.name} — {p.type === 'PERCENT' ? `-${p.value}%` : p.type === 'FIXED' ? `-${p.value} FCFA` : `${p.value} FCFA`}
              {p.minQty > 1 ? ` (dès ${p.minQty} unités)` : ''}
              {p.productIds?.length ? ` · ${p.productIds.length} produit(s)` : ' · toute la boutique'}
            </p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {store.products?.map((p: any) => {
            const promoPrice = priceOf(p);
            return (
              <div key={p.id} className="bg-white p-4 rounded shadow">
                <h4 className="font-bold">{p.name}</h4>
                <p className="text-sm text-gray-500">{p.description}</p>
                {promoPrice < p.price ? (
                  <p className="font-bold text-green-700">{promoPrice} FCFA <span className="text-gray-400 line-through text-sm font-normal">{p.price} F</span></p>
                ) : (
                  <p className="font-bold text-green-700">{p.price} FCFA</p>
                )}
                <button onClick={() => add(p)} className="mt-2 bg-green-700 text-white px-3 py-1 rounded text-sm">Ajouter</button>
              </div>
            );
          })}
        </div>

        <div className="space-y-6">
          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-bold mb-2">Panier ({cart.length})</h3>
            {cart.map((c: any) => (
              <div key={c.productId} className="flex justify-between text-sm">
                <span>{c.product.name} x{c.quantity}</span>
                <span>{priceOf(c.product) * c.quantity}</span>
              </div>
            ))}
            <div className="mt-2 text-sm">
              <label className="mr-3"><input type="radio" checked={deliveryType === 'LIVRAISON'} onChange={() => setDeliveryType('LIVRAISON')} /> Livraison</label>
              <label><input type="radio" checked={deliveryType === 'RETRAIT'} onChange={() => setDeliveryType('RETRAIT')} /> Retrait boutique</label>
            </div>
            <div className="mt-2 flex gap-2">
              <input className="border p-2 flex-1 uppercase text-sm" placeholder="Code promo" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} />
              <button onClick={checkCoupon} disabled={!couponCode} className="border border-green-700 text-green-700 px-3 rounded text-sm">Vérifier</button>
            </div>
            {couponInfo && <p className="text-green-700 text-sm mt-1">✅ Coupon valide : -{couponInfo.discount} FCFA</p>}
            {couponError && <p className="text-red-600 text-sm mt-1">{couponError}</p>}
            <div className="font-bold mt-3">
              <div className="flex justify-between text-sm font-normal"><span>Sous-total</span><span>{subtotal} F</span></div>
              <div className="flex justify-between text-sm font-normal"><span>Frais livraison</span><span>{fees} F</span></div>
              {couponInfo && <div className="flex justify-between text-sm font-normal text-green-700"><span>Coupon</span><span>-{couponInfo.discount} F</span></div>}
              <div className="flex justify-between mt-1"><span>Total</span><span>{Math.max(0, subtotal + fees - (couponInfo?.discount || 0))} FCFA</span></div>
            </div>
            <button onClick={order} disabled={!cart.length} className="mt-3 w-full bg-green-700 text-white p-2 rounded disabled:bg-gray-300">Commander</button>
            <p className="text-xs text-gray-400 mt-1">Prix et remise confirmés par le serveur.</p>
          </div>

          <div className="bg-white p-4 rounded shadow">
            <h3 className="font-bold mb-2">Avis vérifiés</h3>
            {reviews.stats.count > 0 ? (
              <>
                <p className="text-yellow-500 text-lg">★ {reviews.stats.average}/5 <span className="text-gray-500 text-sm">({reviews.stats.count} avis)</span></p>
                <div className="space-y-2 mt-2 max-h-60 overflow-auto">
                  {reviews.reviews.slice(0, 10).map((r: any) => (
                    <div key={r.id} className="border-b pb-2">
                      <p className="text-yellow-500 text-sm">{'★'.repeat(r.rating)}</p>
                      {r.comment && <p className="text-sm">{r.comment}</p>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">Aucun avis vérifié pour le moment.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
