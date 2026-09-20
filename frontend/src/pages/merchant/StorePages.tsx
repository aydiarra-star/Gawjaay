import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

export function SalesPage() {
  const { storeId } = useParams();
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [customerPhone, setCustomerPhone] = useState('');

  useEffect(()=>{
    api.get(`/sales/store/${storeId}`).then(r=>setSales(r.data));
    api.get(`/products/store/${storeId}`).then(r=>setProducts(r.data));
  }, [storeId]);

  const addToCart = (p:any)=>{
    const existing = cart.find(c=>c.productId===p.id);
    if (existing) setCart(cart.map(c=>c.productId===p.id?{...c, quantity:c.quantity+1}:c));
    else setCart([...cart, { productId:p.id, name:p.name, quantity:1, unitPrice:p.price }]);
  };

  const createSale = async ()=>{
    const total = cart.reduce((s,i)=>s+i.quantity*i.unitPrice,0);
    await api.post(`/sales/store/${storeId}`, { items: cart, amountPaid: total, paymentMethod: 'CASH' });
    setCart([]);
    api.get(`/sales/store/${storeId}`).then(r=>setSales(r.data));
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Ventes - {storeId}</h1>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Produits</h3>
          <div className="grid grid-cols-2 gap-2">
            {products.map((p:any)=>(
              <div key={p.id} className="border p-2 rounded flex justify-between">
                <span>{p.name} ({p.price} FCFA)</span>
                <button onClick={()=>addToCart(p)} className="bg-green-700 text-white px-2 rounded">+</button>
              </div>
            ))}
          </div>
          <h3 className="font-bold mt-6 mb-2">Ventes récentes</h3>
          <div className="space-y-1 text-sm">
            {sales.slice(0,10).map((s:any)=><div key={s.id} className="border-b py-1">{new Date(s.createdAt).toLocaleString()} - {s.totalAmount} FCFA - {s.paymentMethod}</div>)}
          </div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Panier ({cart.length})</h3>
          {cart.map((c:any)=><div key={c.productId} className="flex justify-between text-sm py-1"><span>{c.name} x{c.quantity}</span><span>{c.quantity*c.unitPrice}</span></div>)}
          <div className="mt-4 font-bold">Total: {cart.reduce((s,i)=>s+i.quantity*i.unitPrice,0)} FCFA</div>
          <button onClick={createSale} disabled={!cart.length} className="mt-4 w-full bg-green-700 text-white p-2 rounded disabled:bg-gray-300">Enregistrer vente</button>
        </div>
      </div>
    </div>
  );
}

export function OrdersPage() {
  const { storeId } = useParams();
  const [orders, setOrders] = useState<any[]>([]);

  const load = ()=> api.get('/orders', { params: { storeId } }).then(r=>setOrders(r.data));
  useEffect(()=>{ load(); }, [storeId]);

  const updateStatus = async (id:string, status:string)=>{
    await api.patch(`/orders/${id}/status`, { status });
    load();
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Commandes - {storeId}</h1>
      <div className="space-y-3">
        {orders.map((o:any)=>(
          <div key={o.id} className="bg-white p-4 rounded shadow">
            <div className="flex justify-between">
              <span className="font-bold">{o.orderNumber} - {o.totalAmount} FCFA</span>
              <span className="text-sm bg-gray-100 px-2 py-1 rounded">{o.status}</span>
            </div>
            <p className="text-sm">Client: {o.client?.phone} | Type: {o.deliveryType}</p>
            <div className="mt-2 flex gap-2">
              {o.status==='EN_ATTENTE' && <button onClick={()=>updateStatus(o.id,'CONFIRMEE')} className="bg-green-700 text-white px-3 py-1 rounded text-sm">Confirmer (décrémente stock)</button>}
              {o.status==='CONFIRMEE' && <button onClick={()=>updateStatus(o.id,'EN_PREPARATION')} className="bg-blue-600 text-white px-3 py-1 rounded text-sm">Préparation</button>}
              {o.status==='EN_PREPARATION' && <button onClick={()=>updateStatus(o.id,'PRETE')} className="bg-yellow-600 text-white px-3 py-1 rounded text-sm">Prête</button>}
              {o.status==='PRETE' && <button onClick={()=>updateStatus(o.id,'EN_LIVRAISON')} className="bg-purple-600 text-white px-3 py-1 rounded text-sm">En livraison</button>}
              {o.status==='EN_LIVRAISON' && <button onClick={()=>updateStatus(o.id,'LIVREE')} className="bg-green-700 text-white px-3 py-1 rounded text-sm">Livrée</button>}
              {['EN_ATTENTE','CONFIRMEE'].includes(o.status) && <button onClick={()=>updateStatus(o.id,'ANNULEE')} className="bg-red-600 text-white px-3 py-1 rounded text-sm">Annuler</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InventoryPage() {
  const { storeId } = useParams();
  const [stock, setStock] = useState<any[]>([]);
  const [low, setLow] = useState<any[]>([]);
  useEffect(()=>{
    api.get(`/inventory/${storeId}`).then(r=>setStock(r.data));
    api.get(`/inventory/${storeId}/low`).then(r=>setLow(r.data));
  }, [storeId]);
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Stock - {storeId}</h1>
      <div className="bg-red-50 p-4 rounded mb-4">
        <h3 className="font-bold text-red-700">Alertes stock faible ({low.length})</h3>
        {low.map((l:any)=><div key={l.id} className="text-sm">{l.product.name}: {l.quantity} restant (seuil {l.product.lowStockThreshold})</div>)}
      </div>
      <div className="bg-white p-4 rounded shadow">
        <table className="w-full text-sm">
          <thead><tr><th className="text-left">Produit</th><th>Quantité</th><th>Seuil</th></tr></thead>
          <tbody>{stock.map((s:any)=><tr key={s.id} className="border-t"><td>{s.product.name}</td><td>{s.quantity}</td><td>{s.product.lowStockThreshold}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export function CustomersPage() {
  const { storeId } = useParams();
  const [customers, setCustomers] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  useEffect(()=>{
    api.get(`/customers/store/${storeId}`).then(r=>setCustomers(r.data));
    api.get(`/debts/store/${storeId}`).then(r=>setDebts(r.data));
  }, [storeId]);
  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Clients & Dettes</h1>
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Clients ({customers.length})</h3>
          {customers.map((c:any)=><div key={c.id} className="border-b py-2 text-sm">{c.name} - {c.phone}</div>)}
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Dettes non soldées ({debts.length})</h3>
          {debts.map((d:any)=><div key={d.id} className="border-b py-2 text-sm">{d.customer.name}: {d.balance} FCFA / {d.totalAmount} FCFA <PayDebt debt={d} onPaid={()=>api.get(`/debts/store/${storeId}`).then(r=>setDebts(r.data))} /></div>)}
        </div>
      </div>
    </div>
  );
}

function PayDebt({ debt, onPaid }: any) {
  const [amount, setAmount] = useState('');
  const pay = async ()=>{
    await api.post(`/debts/${debt.id}/pay`, { amount: parseFloat(amount), method: 'CASH' });
    onPaid();
    setAmount('');
  };
  return <span className="ml-2"><input className="border w-20 p-1" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Montant" /><button onClick={pay} className="ml-1 bg-green-700 text-white px-2 py-1 rounded text-xs">Payer</button></span>;
}
