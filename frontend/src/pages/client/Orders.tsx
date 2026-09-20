import { useEffect, useState } from 'react';
import api from '../../lib/api';

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1 text-2xl">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className={n <= value ? 'text-yellow-500' : 'text-gray-300'}>★</button>
      ))}
    </div>
  );
}

function ReviewForm({ order, onDone }: { order: any; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState('');
  const [productRatings, setProductRatings] = useState<Record<string, { rating: number; comment: string }>>({});

  const submitStore = async () => {
    setMsg('');
    try {
      await api.post('/reviews', { orderId: order.id, targetType: 'STORE', rating, comment: comment || undefined });
      setMsg('Merci ! Avis boutique publié.');
      onDone();
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Erreur');
    }
  };

  const submitProduct = async (productId: string) => {
    const pr = productRatings[productId];
    try {
      await api.post('/reviews', { orderId: order.id, targetType: 'PRODUCT', targetId: productId, rating: pr.rating, comment: pr.comment || undefined });
      setProductRatings({ ...productRatings, [productId]: { rating: 0, comment: '', done: true } as any });
      setMsg('Avis produit publié, merci !');
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Erreur');
    }
  };

  return (
    <div className="mt-3 border-t pt-3">
      <p className="font-bold text-sm mb-2">Notez votre expérience</p>
      <Stars value={rating} onChange={setRating} />
      <textarea className="border p-2 w-full mt-2 text-sm" rows={2} placeholder="Votre commentaire (optionnel)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <button onClick={submitStore} className="mt-2 bg-green-700 text-white px-4 py-2 rounded text-sm">Publier l'avis boutique</button>

      {(order.items || []).length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-bold">Noter les produits</p>
          {order.items.map((it: any) => {
            const pr = productRatings[it.productId] || { rating: 0, comment: '' };
            if ((pr as any).done) return <p key={it.productId} className="text-xs text-green-700">✅ {it.name} : avis publié</p>;
            return (
              <div key={it.productId} className="bg-gray-50 p-2 rounded">
                <p className="text-sm">{it.name}</p>
                <Stars value={pr.rating} onChange={(n) => setProductRatings({ ...productRatings, [it.productId]: { ...pr, rating: n } })} />
                <div className="flex gap-2">
                  <input className="border p-1 flex-1 text-xs" placeholder="Commentaire" value={pr.comment} onChange={(e) => setProductRatings({ ...productRatings, [it.productId]: { ...pr, comment: e.target.value } })} />
                  <button onClick={() => submitProduct(it.productId)} disabled={!pr.rating} className="bg-green-700 text-white px-3 rounded text-xs disabled:bg-gray-300">Publier</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {msg && <p className="text-sm text-green-700 mt-2">{msg}</p>}
    </div>
  );
}

export default function Orders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, any>>({});

  const load = () => api.get('/orders').then((r) => setOrders(r.data));
  useEffect(() => { load(); }, []);

  const pay = async (order: any, provider: string) => {
    const idempotencyKey = `${order.id}-${provider}-${Date.now()}`;
    const res = await api.post('/payments/initiate', { orderId: order.id, provider }, { headers: { 'Idempotency-Key': idempotencyKey } });
    alert(`Paiement ${provider} initié ${res.data.transactionId}. Simulation sandbox - vérification...`);
    const verify = await api.post(`/payments/${res.data.id}/verify`);
    alert(`Paiement status: ${verify.data.status}`);
    load();
  };

  const openReview = async (orderId: string) => {
    setReviewing(orderId);
    if (!details[orderId]) {
      const r = await api.get(`/orders/${orderId}`);
      setDetails({ ...details, [orderId]: r.data });
    }
  };

  const cancel = async (orderId: string) => {
    if (!confirm('Annuler cette commande ?')) return;
    try {
      await api.patch(`/orders/${orderId}/status`, { status: 'ANNULEE' });
      load();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erreur');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Mes commandes</h1>
      <div className="space-y-3">
        {orders.map((o: any) => (
          <div key={o.id} className="bg-white p-4 rounded shadow">
            <div className="flex justify-between flex-wrap gap-2">
              <span className="font-bold">{o.orderNumber} - {o.totalAmount} FCFA</span>
              <span className="text-sm bg-gray-100 px-2 py-1 rounded">{o.status}</span>
            </div>
            <p className="text-sm">Boutique: {o.store?.name} | Paiement: {o.payment?.status} ({o.payment?.provider})</p>
            {o.discount > 0 && <p className="text-sm text-green-700">Remise appliquée : -{o.discount} FCFA</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {o.payment?.status !== 'SUCCESS' && o.status !== 'ANNULEE' && (
                <>
                  <button onClick={() => pay(o, 'WAVE')} className="bg-blue-500 text-white px-3 py-1 rounded text-sm">Payer Wave (sandbox)</button>
                  <button onClick={() => pay(o, 'ORANGE_MONEY')} className="bg-orange-500 text-white px-3 py-1 rounded text-sm">Payer OM (sandbox)</button>
                  {o.status === 'EN_ATTENTE' && <button onClick={() => cancel(o.id)} className="border border-red-300 text-red-600 px-3 py-1 rounded text-sm">Annuler</button>}
                </>
              )}
              {o.status === 'LIVREE' && (
                <button onClick={() => openReview(o.id)} className="bg-yellow-500 text-white px-3 py-1 rounded text-sm">
                  {reviewing === o.id ? 'Fermer' : '⭐ Laisser un avis'}
                </button>
              )}
            </div>
            {reviewing === o.id && <ReviewForm order={details[o.id] || { id: o.id, items: [] }} onDone={() => setReviewing(null)} />}
          </div>
        ))}
        {!orders.length && <p className="text-gray-500">Aucune commande. Visitez la <a href="/marketplace" className="text-green-700">marketplace</a> !</p>}
      </div>
    </div>
  );
}
