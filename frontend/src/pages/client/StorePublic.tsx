import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api from '../../lib/api';

const DAY_LABELS: Record<string, string> = { mon: 'Lun', tue: 'Mar', wed: 'Mer', thu: 'Jeu', fri: 'Ven', sat: 'Sam', sun: 'Dim' };

/** Horaires tels que déclarés par la boutique (JSON {mon:'08:00-20:00'} ou texte libre) — rien n'est inventé. */
function parseHours(raw: any): Array<[string, string]> | string | null {
  if (!raw) return null;
  let v: any = raw;
  if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch { return raw; } }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const entries = Object.entries(v).filter(([, h]) => typeof h === 'string' && h) as Array<[string, string]>;
    return entries.length ? entries : null;
  }
  return typeof v === 'string' ? v : null;
}
function parseList(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

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
  const [category, setCategory] = useState('');
  const [capabilities, setCapabilities] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orderMsg, setOrderMsg] = useState('');

  useEffect(() => {
    setNotFound(false);
    api.get(`/stores/slug/${slug}`).then((r) => {
      setStore(r.data);
      setDeliveryType(r.data.allowDelivery === 0 || r.data.allowDelivery === false ? 'RETRAIT' : 'LIVRAISON');
      api.get(`/promotions/store/${r.data.id}/active`).then((x) => setPromos(x.data)).catch(() => {});
      api.get(`/reviews/store/${r.data.id}`).then((x) => setReviews(x.data)).catch(() => {});
    }).catch(() => setNotFound(true));
    api.get('/payments/capabilities').then((x) => setCapabilities(x.data)).catch(() => setCapabilities(null));
  }, [slug]);

  if (notFound) return <div className="bg-white p-6 rounded shadow">Boutique introuvable.</div>;
  if (!store) return <div>Chargement...</div>;

  const hours = parseHours(store.openingHours);
  const zones = parseList(store.deliveryZones);
  const advertised = parseList(store.paymentMethods);
  const availableCodes = new Set((capabilities?.methods || []).filter((m: any) => m.available).map((m: any) => m.code));
  const allowDelivery = !(store.allowDelivery === 0 || store.allowDelivery === false);
  const allowPickup = !(store.allowPickup === 0 || store.allowPickup === false);
  const storeCategories: any[] = store.categories || [];
  const visibleProducts: any[] = (store.products || []).filter((p: any) => !category || p.categoryId === category);
  const publicUrl = window.location.href;

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
    if (!cart.length || busy) return;
    setBusy(true); setOrderMsg('');
    try {
      const res = await api.post('/orders', {
        storeId: store.id,
        items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        deliveryType,
        couponCode: couponInfo ? couponCode : undefined,
      });
      const promoSaved = res.data.discount > 0 ? ` (dont ${res.data.discount} F de remise)` : '';
      alert(`Commande ${res.data.orderNumber} créée - ${res.data.totalAmount} FCFA${promoSaved}`);
      setCart([]); setCouponInfo(null); setCouponCode('');
    } catch (e: any) {
      // 401 : non connecté (l'intercepteur redirige) ; 400 : stock/boutique fermée/mode non proposé → motif serveur
      setOrderMsg(e.response?.data?.error || 'Commande refusée par le serveur');
    } finally { setBusy(false); }
  };

  const whatsappLink = `https://wa.me/?text=${encodeURIComponent(`Découvre ma boutique ${store.name} sur GawJaay: ${publicUrl}`)}`;
  const contactWhatsapp = store.whatsapp ? `https://wa.me/${String(store.whatsapp).replace(/[^0-9]/g, '')}` : null;

  return (
    <div>
      <div className="bg-white p-4 md:p-6 rounded shadow mb-6">
        <div className="flex flex-col md:flex-row gap-4 md:items-start">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
              {store.logoUrl && <img src={store.logoUrl} alt="" className="w-14 h-14 rounded object-cover" />}
              <h1 className="text-2xl md:text-3xl font-bold">{store.name}</h1>
              {store.isVerified ? <span className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1 rounded">Vérifiée</span> : null}
              {reviews.stats.count > 0 && (
                <span className="text-sm bg-yellow-50 border border-yellow-200 px-2 py-1 rounded">
                  ★ {reviews.stats.average}/5 ({reviews.stats.count} avis)
                </span>
              )}
            </div>
            {store.category && <p className="text-xs text-gray-500 mt-1">{store.category}</p>}
            <p className="text-gray-600 mt-1">{store.description}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm mt-3">
              <div>
                <p className="font-semibold">Adresse</p>
                <p>{[store.addressText, store.quartier].filter(Boolean).join(' - ') || 'Non renseignée'}</p>
                {store.latitude != null && store.longitude != null && (
                  <a className="text-blue-600 text-xs" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${store.latitude}&mlon=${store.longitude}#map=17/${store.latitude}/${store.longitude}`}>Voir sur la carte</a>
                )}
              </div>
              <div>
                <p className="font-semibold">Contact</p>
                {store.phone ? <p><a className="text-blue-600" href={`tel:${store.phone}`}>{store.phone}</a></p> : null}
                {contactWhatsapp ? <p><a className="text-green-700" href={contactWhatsapp} target="_blank" rel="noreferrer">WhatsApp {store.whatsapp}</a></p> : null}
                {store.email ? <p><a className="text-blue-600" href={`mailto:${store.email}`}>{store.email}</a></p> : null}
                {!store.phone && !contactWhatsapp && !store.email && <p className="text-gray-500">Non renseigné</p>}
              </div>
              <div>
                <p className="font-semibold">Horaires</p>
                {Array.isArray(hours) ? (
                  <ul className="text-xs">{hours.map(([d, h]) => <li key={d}>{DAY_LABELS[d] || d} : {h}</li>)}</ul>
                ) : hours ? <p className="text-xs whitespace-pre-line">{hours}</p> : <p className="text-gray-500">Non renseignés</p>}
              </div>
              <div>
                <p className="font-semibold">Livraison & retrait</p>
                <p className="text-xs">
                  {allowDelivery ? `Livraison : ${store.deliveryFees || 0} FCFA${store.deliveryDelayMinutes ? ` · ~${store.deliveryDelayMinutes} min` : ''}` : 'Pas de livraison'}
                  {zones.length ? ` · zones : ${zones.join(', ')}` : ''}
                </p>
                <p className="text-xs">{allowPickup ? 'Retrait en boutique possible' : 'Pas de retrait en boutique'}</p>
                {advertised.length > 0 && (
                  <p className="text-xs">Paiement : {advertised.map((m: string) => (m === 'CASH' ? 'Espèces' : m === 'CREDIT' ? 'Crédit' : m === 'ORANGE_MONEY' ? 'Orange Money' : m === 'WAVE' ? 'Wave' : 'Carte') + (m !== 'CASH' && m !== 'CREDIT' && !availableCodes.has(m) ? ' (non connecté en ligne)' : '')).join(', ')}</p>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <a href={whatsappLink} target="_blank" rel="noreferrer" className="bg-green-500 text-white px-4 py-2 rounded">Partager WhatsApp</a>
              <button onClick={() => navigator.clipboard?.writeText(publicUrl)} className="border px-4 py-2 rounded">Copier lien</button>
            </div>
            <p className="mt-2 text-xs">Statut physique: {store.physicalStatus} | Boutique en ligne: {store.digitalStatus}</p>
          </div>
          <div className="text-center text-xs text-gray-600 shrink-0">
            <QRCodeSVG value={publicUrl} size={128} includeMargin aria-label={`QR code de la boutique ${store.name}`} />
            <p className="mt-1">Scannez pour ouvrir la boutique</p>
          </div>
        </div>
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
        <div className="lg:col-span-2">
          {storeCategories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 text-sm">
              <button onClick={() => setCategory('')} className={`px-3 py-1 rounded border ${!category ? 'bg-green-700 text-white border-green-700' : ''}`}>Tout</button>
              {storeCategories.map((c: any) => (
                <button key={c.id} onClick={() => setCategory(c.id)} className={`px-3 py-1 rounded border ${category === c.id ? 'bg-green-700 text-white border-green-700' : ''}`}>{c.name}</button>
              ))}
            </div>
          )}
          {!visibleProducts.length && <p className="text-gray-500 text-sm">Aucun produit en ligne{category ? ' dans cette catégorie' : ''}.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleProducts.map((p: any) => {
            const promoPrice = priceOf(p);
            return (
              <div key={p.id} className="bg-white p-4 rounded shadow">
                <h4 className="font-bold">{p.name}</h4>
                {p.categoryName && <p className="text-xs text-gray-400">{p.categoryName}</p>}
                <p className="text-sm text-gray-500">{p.description}</p>
                {promoPrice < p.price ? (
                  <p className="font-bold text-green-700">{promoPrice} FCFA <span className="text-gray-400 line-through text-sm font-normal">{p.price} F</span></p>
                ) : (
                  <p className="font-bold text-green-700">{p.price} FCFA</p>
                )}
                {p.inStock === false ? (
                  <p className="mt-2 text-xs text-red-600">Rupture de stock</p>
                ) : (
                  <button onClick={() => add(p)} className="mt-2 bg-green-700 text-white px-3 py-1 rounded text-sm">Ajouter</button>
                )}
              </div>
            );
          })}
          </div>
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
              {allowDelivery && <label className="mr-3"><input type="radio" checked={deliveryType === 'LIVRAISON'} onChange={() => setDeliveryType('LIVRAISON')} /> Livraison</label>}
              {allowPickup && <label><input type="radio" checked={deliveryType === 'RETRAIT'} onChange={() => setDeliveryType('RETRAIT')} /> Retrait boutique</label>}
              {!allowDelivery && !allowPickup && <p className="text-red-600 text-xs">Cette boutique n'accepte pas de commande en ligne pour le moment.</p>}
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
            <button onClick={order} disabled={!cart.length || busy || (!allowDelivery && !allowPickup)} className="mt-3 w-full bg-green-700 text-white p-2 rounded disabled:bg-gray-300">{busy ? 'Envoi…' : 'Commander'}</button>
            {orderMsg && <p className="text-xs text-red-600 mt-1" role="alert">{orderMsg}</p>}
            <p className="text-xs text-gray-400 mt-1">Prix, stock et remise confirmés par le serveur. Paiement : espèces confirmées par la boutique{availableCodes.size > 1 ? ' ou paiement mobile' : ' (paiement mobile non connecté)'}.</p>
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
