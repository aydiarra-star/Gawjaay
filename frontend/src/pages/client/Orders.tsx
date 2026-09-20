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

const STEPS = ['EN_ATTENTE', 'CONFIRMEE', 'EN_PREPARATION', 'PRETE', 'EN_LIVRAISON', 'LIVREE'];
const STEP_LABELS: Record<string, string> = {
  EN_ATTENTE: 'En attente', CONFIRMEE: 'Confirmée', EN_PREPARATION: 'En préparation', PRETE: 'Prête',
  EN_LIVRAISON: 'En livraison', LIVREE: 'Livrée', ANNULEE: 'Annulée', REJETEE: 'Rejetée par la boutique', RETOURNEE: 'Retournée',
};
const PAYMENT_STATUS_LABELS: Record<string, string> = { PENDING: 'en attente', SUCCESS: 'payé', FAILED: 'échoué', CANCELLED: 'annulé' };

/** Frise d'avancement : uniquement le statut réel renvoyé par le serveur (RETRAIT saute l'étape livraison). */
function Timeline({ order }: { order: any }) {
  const terminal = ['ANNULEE', 'REJETEE', 'RETOURNEE'].includes(order.status);
  const steps = order.deliveryType === 'RETRAIT' ? STEPS.filter((s) => s !== 'EN_LIVRAISON') : STEPS;
  const idx = steps.indexOf(order.status);
  return (
    <div className="mt-2">
      <ol className="flex flex-wrap gap-1 text-xs">
        {steps.map((st, i) => (
          <li key={st} className={`px-2 py-1 rounded ${!terminal && i <= idx ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-500'}`}>{STEP_LABELS[st]}</li>
        ))}
      </ol>
      {terminal && <p className="text-xs text-red-700 mt-1">{STEP_LABELS[order.status]}</p>}
    </div>
  );
}

export default function Orders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, any>>({});
  const [capabilities, setCapabilities] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = () => api.get('/orders').then((r) => setOrders(r.data)).catch(() => setOrders([]));
  useEffect(() => {
    load();
    // Capacités réelles de paiement : on n'affiche JAMAIS un bouton de paiement mobile si le fournisseur n'est pas connecté.
    api.get('/payments/capabilities').then((r) => setCapabilities(r.data)).catch(() => setCapabilities(null));
  }, []);

  const mobileMethods: any[] = (capabilities?.methods || []).filter((m: any) => m.code !== 'CASH' && m.code !== 'CREDIT');
  const availableMobile = mobileMethods.filter((m: any) => m.available);

  const pay = async (order: any, provider: string) => {
    if (busyId) return;
    setMsg(''); setBusyId(order.id);
    try {
      const idempotencyKey = `${order.id}-${provider}-${Date.now()}`;
      const res = await api.post('/payments/initiate', { orderId: order.id, provider }, { headers: { 'Idempotency-Key': idempotencyKey } });
      const verify = await api.post(`/payments/${res.data.id}/verify`);
      setMsg(`Paiement ${provider} : statut ${PAYMENT_STATUS_LABELS[verify.data.status] || verify.data.status} (confirmé par le serveur${capabilities?.mode === 'sandbox' ? ', mode simulation' : ''}).`);
      load();
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Paiement indisponible');
    } finally { setBusyId(''); }
  };

  const openReview = async (orderId: string) => {
    if (reviewing === orderId) { setReviewing(null); return; }
    setReviewing(orderId);
    if (!details[orderId]) {
      const r = await api.get(`/orders/${orderId}`);
      setDetails({ ...details, [orderId]: r.data });
    }
  };

  const cancel = async (orderId: string) => {
    if (!confirm('Annuler cette commande ?')) return;
    setMsg('');
    try {
      await api.patch(`/orders/${orderId}/status`, { status: 'ANNULEE' });
      load();
    } catch (e: any) {
      setMsg(e.response?.data?.error || 'Annulation refusée');
      load();
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Mes commandes</h1>
      {capabilities && !capabilities.productionProviderConnected && (
        <p className="text-xs text-orange-800 bg-orange-50 border border-orange-200 p-2 rounded mb-3">
          Paiement mobile (Wave / Orange Money / carte) : {availableMobile.length ? 'mode simulation (aucun débit réel)' : 'NON CONNECTÉ — réglez en espèces à la livraison ou au retrait, la boutique confirme l\'encaissement.'}
        </p>
      )}
      {msg && <p className="text-sm bg-gray-50 border p-2 rounded mb-3" role="status">{msg}</p>}
      <div className="space-y-3">
        {orders.map((o: any) => {
          const cancellable = (o.allowedTransitions || []).includes('ANNULEE');
          const payable = o.payment?.status !== 'SUCCESS' && !['ANNULEE', 'REJETEE'].includes(o.status);
          return (
            <div key={o.id} className="bg-white p-4 rounded shadow">
              <div className="flex justify-between flex-wrap gap-2">
                <span className="font-bold">{o.orderNumber} - {o.totalAmount} FCFA</span>
                <span className="text-sm bg-gray-100 px-2 py-1 rounded" title={o.statusCode}>{o.status}</span>
              </div>
              <p className="text-sm">Boutique: {o.store?.name} | {o.deliveryType === 'RETRAIT' ? 'Retrait en boutique' : 'Livraison'} | {new Date(o.createdAt).toLocaleString('fr-FR')}</p>
              {!!o.items?.length && <p className="text-xs text-gray-600">{o.items.map((it: any) => `${it.name} ×${it.quantity}`).join(', ')}</p>}
              <p className="text-sm">
                Paiement : {o.payment?.provider === 'CASH' ? 'espèces' : o.payment?.provider} · {PAYMENT_STATUS_LABELS[o.payment?.status] || o.payment?.status || '—'}
                {o.payment?.provider === 'CASH' && o.payment?.status === 'PENDING' && payable && <span className="text-gray-500"> (à régler à la boutique, qui confirme l\'encaissement)</span>}
              </p>
              {o.discount > 0 && <p className="text-sm text-green-700">Remise appliquée : -{o.discount} FCFA</p>}
              <Timeline order={o} />
              <div className="mt-2 flex flex-wrap gap-2">
                {payable && availableMobile.map((m: any) => (
                  <button key={m.code} onClick={() => pay(o, m.code)} disabled={busyId === o.id} className="bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50">
                    Payer {m.code === 'ORANGE_MONEY' ? 'Orange Money' : m.code === 'WAVE' ? 'Wave' : m.code === 'CARD' ? 'par carte' : m.code}{capabilities?.mode === 'sandbox' ? ' (simulation)' : ''}
                  </button>
                ))}
                {cancellable && <button onClick={() => cancel(o.id)} className="border border-red-300 text-red-600 px-3 py-1 rounded text-sm">Annuler</button>}
                {o.status === 'LIVREE' && (
                  <button onClick={() => openReview(o.id)} className="bg-yellow-500 text-white px-3 py-1 rounded text-sm">
                    {reviewing === o.id ? 'Fermer' : '⭐ Laisser un avis'}
                  </button>
                )}
              </div>
              {reviewing === o.id && <ReviewForm order={details[o.id] || { id: o.id, items: o.items || [] }} onDone={() => setReviewing(null)} />}
            </div>
          );
        })}
        {!orders.length && <p className="text-gray-500">Aucune commande. Visitez la <a href="/marketplace" className="text-green-700">marketplace</a> !</p>}
      </div>
    </div>
  );
}
