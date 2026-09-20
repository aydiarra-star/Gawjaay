import { useEffect, useState } from 'react';
import api from '../../lib/api';

export default function Orders() {
  const [orders, setOrders] = useState<any[]>([]);
  useEffect(()=>{ api.get('/orders').then(r=>setOrders(r.data)); }, []);

  const pay = async (order:any, provider:string)=>{
    const idempotencyKey = `${order.id}-${provider}-${Date.now()}`;
    const res = await api.post('/payments/initiate', { orderId: order.id, provider }, { headers: { 'Idempotency-Key': idempotencyKey } });
    alert(`Paiement ${provider} initié ${res.data.transactionId}. Simulation sandbox - vérification...`);
    const verify = await api.post(`/payments/${res.data.id}/verify`);
    alert(`Paiement status: ${verify.data.status}`);
    api.get('/orders').then(r=>setOrders(r.data));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Mes commandes</h1>
      <div className="space-y-3">
        {orders.map((o:any)=>(
          <div key={o.id} className="bg-white p-4 rounded shadow">
            <div className="flex justify-between"><span className="font-bold">{o.orderNumber} - {o.totalAmount} FCFA</span><span className="text-sm bg-gray-100 px-2 py-1 rounded">{o.status}</span></div>
            <p className="text-sm">Boutique: {o.store?.name} | Paiement: {o.payment?.status} ({o.payment?.provider})</p>
            {o.payment?.status !== 'SUCCESS' && (
              <div className="mt-2 flex gap-2">
                <button onClick={()=>pay(o,'WAVE')} className="bg-blue-500 text-white px-3 py-1 rounded text-sm">Payer Wave (sandbox)</button>
                <button onClick={()=>pay(o,'ORANGE_MONEY')} className="bg-orange-500 text-white px-3 py-1 rounded text-sm">Payer OM (sandbox)</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
