import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

export function SalesPage() {
  const { storeId } = useParams();
  const [sales, setSales] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [customerPhone, setCustomerPhone] = useState('');
  const [scanCode, setScanCode] = useState('');
  const [scanError, setScanError] = useState('');

  useEffect(()=>{
    api.get(`/sales/store/${storeId}`).then(r=>setSales(r.data));
    api.get(`/products/store/${storeId}`).then(r=>setProducts(r.data));
  }, [storeId]);

  // V2 LOT B : vente rapide par scan code-barres / SKU
  const scan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanCode.trim()) return;
    setScanError('');
    try {
      const r = await api.get(`/barcodes/${encodeURIComponent(scanCode.trim())}?storeId=${storeId}`);
      const p = r.data;
      addToCart({ id: p.id, name: p.name, price: p.price });
      setScanCode('');
    } catch (err: any) {
      setScanError(err.response?.status === 404 ? 'Code inconnu dans cette boutique' : 'Erreur de scan');
    }
  };

  const addToCart = (p:any)=>{
    const existing = cart.find(c=>c.productId===p.id);
    if (existing) setCart(cart.map(c=>c.productId===p.id?{...c, quantity:c.quantity+1}:c));
    else setCart([...cart, { productId:p.id, name:p.name, quantity:1, unitPrice:p.price }]);
  };

  const [busySale, setBusySale] = useState(false);
  const createSale = async ()=>{
    if (busySale) return;
    setBusySale(true); // anti double-tap (§21) : une seule vente par clic
    try {
    const total = cart.reduce((s,i)=>s+i.quantity*i.unitPrice,0);
    await api.post(`/sales/store/${storeId}`, { items: cart, amountPaid: total, paymentMethod: 'CASH' });
    setCart([]);
    } finally { setBusySale(false); }
    api.get(`/sales/store/${storeId}`).then(r=>setSales(r.data));
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Ventes - {storeId}</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">🖥️ Scan code-barres (vente rapide)</h3>
          <form onSubmit={scan} className="flex gap-2 mb-2">
            <input className="border p-2 flex-1" placeholder="Scannez ou saisissez un code-barres / SKU puis Entrée" value={scanCode} onChange={(e)=>setScanCode(e.target.value)} autoFocus />
            <button type="submit" className="bg-green-700 text-white px-4 rounded">Scan</button>
          </form>
          {scanError && <p className="text-red-600 text-sm mb-2">{scanError}</p>}
          <h3 className="font-bold mb-2 mt-4">Produits</h3>
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
          <button onClick={createSale} disabled={!cart.length || busySale} className="mt-4 w-full bg-green-700 text-white p-2 rounded disabled:bg-gray-300">Enregistrer vente</button>
        </div>
      </div>
    </div>
  );
}

/** Libellés des actions de la machine à états (le serveur reste seul juge : on n'affiche que `allowedTransitions`). */
const TRANSITION_LABELS: Record<string, { label: string; cls: string; askReason?: boolean }> = {
  CONFIRMEE: { label: 'Confirmer (décrémente stock)', cls: 'bg-green-700' },
  EN_PREPARATION: { label: 'Préparation', cls: 'bg-blue-600' },
  PRETE: { label: 'Prête', cls: 'bg-yellow-600' },
  EN_LIVRAISON: { label: 'En livraison', cls: 'bg-purple-600' },
  LIVREE: { label: 'Livrée', cls: 'bg-green-700' },
  RETOURNEE: { label: 'Retournée', cls: 'bg-orange-600', askReason: true },
  ANNULEE: { label: 'Annuler', cls: 'bg-red-600', askReason: true },
  REJETEE: { label: 'Rejeter', cls: 'bg-red-800', askReason: true },
};
const STATUS_HINT: Record<string, string> = {
  EN_ATTENTE: 'à confirmer', CONFIRMEE: 'stock réservé', EN_PREPARATION: 'en préparation', PRETE: 'prête',
  EN_LIVRAISON: 'en livraison', LIVREE: 'livrée', ANNULEE: 'annulée', REJETEE: 'rejetée', RETOURNEE: 'retournée',
};

export function OrdersPage() {
  const { storeId } = useParams();
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = ()=> api.get('/orders', { params: { storeId, status: filter || undefined } }).then(r=>setOrders(r.data)).catch(()=>setOrders([]));
  useEffect(()=>{ load(); }, [storeId, filter]);

  const updateStatus = async (o: any, status: string)=>{
    const meta = TRANSITION_LABELS[status];
    let reason: string | undefined;
    if (meta?.askReason) {
      const r = window.prompt(`Motif (optionnel) — ${meta.label} la commande ${o.orderNumber} :`, '');
      if (r === null) return; // action abandonnée
      reason = r.trim() ? r.trim().slice(0, 500) : undefined;
    }
    setError(''); setBusyId(o.id);
    try {
      await api.patch(`/orders/${o.id}/status`, reason ? { status, reason } : { status });
      await load();
    } catch (err: any) {
      // transition refusée par le serveur (état changé entre-temps, permission…) : on affiche le motif réel et on resynchronise
      setError(err.response?.data?.error || 'Transition refusée par le serveur');
      await load();
    } finally { setBusyId(''); }
  };

  const confirmCash = async (o: any) => {
    if (!o.payment?.id) return;
    if (!window.confirm(`Confirmer l'encaissement en espèces de ${o.totalAmount} FCFA pour ${o.orderNumber} ?`)) return;
    setError(''); setBusyId(o.id);
    try { await api.post(`/payments/${o.payment.id}/confirm-cash`, {}); await load(); }
    catch (err: any) { setError(err.response?.data?.error || 'Encaissement refusé par le serveur'); }
    finally { setBusyId(''); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h1 className="text-xl font-bold">Commandes en ligne</h1>
        <select className="border p-2 rounded text-sm" value={filter} onChange={(e)=>setFilter(e.target.value)} aria-label="Filtrer par statut">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_HINT).map(([st, hint])=><option key={st} value={st}>{hint.charAt(0).toUpperCase() + hint.slice(1)}</option>)}
        </select>
      </div>
      {error && <div className="bg-red-100 text-red-700 p-2 mb-3 rounded text-sm" role="alert">{error}</div>}
      {!orders.length && <p className="text-gray-500 text-sm">Aucune commande{filter ? ` au statut ${filter}` : ''}.</p>}
      <div className="space-y-3">
        {orders.map((o:any)=>(
          <div key={o.id} className="bg-white p-4 rounded shadow">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="font-bold">{o.orderNumber} - {o.totalAmount} FCFA</span>
              <span className="text-sm bg-gray-100 px-2 py-1 rounded" title={o.statusCode}>{o.status} <span className="text-gray-500">({STATUS_HINT[o.status] || o.statusCode})</span></span>
            </div>
            <p className="text-sm">Client: {o.client?.phone || '—'} | Type: {o.deliveryType}{o.addressText ? ` | ${o.addressText}` : ''} | {new Date(o.createdAt).toLocaleString('fr-FR')}</p>
            {!!o.items?.length && <p className="text-xs text-gray-600 mt-1">{o.items.map((it:any)=>`${it.name} ×${it.quantity}`).join(', ')}</p>}
            {o.payment && (
              <p className="text-xs mt-1">
                Paiement : {o.payment.provider} · <span className={o.payment.status === 'SUCCESS' ? 'text-green-700 font-semibold' : 'text-gray-600'}>{o.payment.status}</span>
                {o.payment.provider === 'CASH' && o.payment.status === 'PENDING' && !['ANNULEE','REJETEE'].includes(o.status) && (
                  <button onClick={()=>confirmCash(o)} disabled={busyId===o.id} className="ml-2 border border-green-700 text-green-700 px-2 py-0.5 rounded disabled:opacity-50">Encaissement espèces reçu</button>
                )}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {(o.allowedTransitions || []).map((t: string) => {
                const meta = TRANSITION_LABELS[t];
                if (!meta) return null;
                return <button key={t} onClick={()=>updateStatus(o, t)} disabled={busyId===o.id} className={`${meta.cls} text-white px-3 py-1 rounded text-sm disabled:opacity-50`}>{meta.label}</button>;
              })}
              {!(o.allowedTransitions || []).length && <span className="text-xs text-gray-400">Statut final</span>}
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
  const [msg, setMsg] = useState('');
  const load = () => {
    api.get(`/inventory/${storeId}`).then(r=>setStock(r.data)).catch(()=>setStock([]));
    api.get(`/inventory/${storeId}/low`).then(r=>setLow(r.data)).catch(()=>setLow([]));
  };
  useEffect(()=>{ load(); }, [storeId]);

  // Ajustement manuel (ADJUSTMENT / PURCHASE_RECEIPT / RETURN) : le serveur journalise le mouvement et recalcule le stock.
  const adjust = async (productId: string, quantity: number, type: string, reason: string) => {
    setMsg('');
    try {
      await api.post(`/inventory/${storeId}/adjust`, { productId, quantity, type, reason: reason || undefined });
      setMsg('Mouvement enregistré (stock recalculé par le serveur).');
      load();
    } catch (err: any) { setMsg(err.response?.data?.error || 'Ajustement refusé'); }
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Stock & alertes</h1>
      <div className="bg-red-50 p-4 rounded mb-4">
        <h3 className="font-bold text-red-700">Alertes stock faible ({low.length})</h3>
        {low.map((l:any)=><div key={l.id} className="text-sm">{l.productName}: {l.quantity} restant (seuil {l.lowStockThreshold})</div>)}
      </div>
      {msg && <p className="text-xs text-gray-700 mb-2" role="status">{msg}</p>}
      <div className="bg-white p-4 rounded shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr><th className="text-left">Produit</th><th>Quantité</th><th>Seuil</th><th className="text-left">Ajuster (± quantité, type, motif)</th></tr></thead>
          <tbody>{stock.map((s:any)=>(
            <tr key={s.id} className="border-t">
              <td>{s.productName}</td><td className="text-center">{s.quantity}</td><td className="text-center">{s.lowStockThreshold}</td>
              <td><RowAdjust onSubmit={(q, t, r) => adjust(s.productId, q, t, r)} /></td>
            </tr>
          ))}</tbody>
        </table>
        {!stock.length && <p className="text-gray-500 text-sm mt-2">Aucun produit en stock pour cette boutique (ou accès refusé).</p>}
      </div>
    </div>
  );
}

function RowAdjust({ onSubmit }: { onSubmit: (quantity: number, type: string, reason: string) => void }) {
  const [quantity, setQuantity] = useState('');
  const [type, setType] = useState('ADJUSTMENT');
  const [reason, setReason] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = Number(quantity);
    if (!Number.isFinite(q) || q === 0) return;
    onSubmit(q, type, reason.trim());
    setQuantity(''); setReason('');
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap gap-1 items-center py-1">
      <input className="border p-1 w-20" type="number" step="any" value={quantity} onChange={(e)=>setQuantity(e.target.value)} placeholder="±qté" aria-label="Quantité" />
      <select className="border p-1" value={type} onChange={(e)=>setType(e.target.value)} aria-label="Type de mouvement">
        <option value="ADJUSTMENT">Ajustement</option>
        <option value="PURCHASE_RECEIPT">Réception</option>
        <option value="RETURN">Retour</option>
      </select>
      <input className="border p-1 w-28" value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Motif" aria-label="Motif" />
      <button className="bg-green-700 text-white px-2 py-1 rounded text-xs" disabled={!quantity}>OK</button>
    </form>
  );
}

export function CustomersPage() {
  const { storeId } = useParams();
  const [customers, setCustomers] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [msg, setMsg] = useState('');
  const loadCustomers = () => api.get(`/customers/store/${storeId}`).then(r=>setCustomers(r.data)).catch(()=>setCustomers([]));
  const loadDebts = () => api.get(`/debts/store/${storeId}`).then(r=>setDebts(r.data)).catch(()=>setDebts([]));
  useEffect(()=>{ loadCustomers(); loadDebts(); }, [storeId]);

  const createCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.post('/customers', { storeId, name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() || undefined, notes: form.notes.trim() || undefined });
      setForm({ name: '', phone: '', address: '', notes: '' });
      setMsg('Client enregistré.');
      loadCustomers();
    } catch (err: any) { setMsg(err.response?.data?.error || 'Création refusée'); }
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Clients & Dettes</h1>
      <form onSubmit={createCustomer} className="bg-white p-4 rounded shadow mb-4 grid grid-cols-1 md:grid-cols-5 gap-2 text-sm">
        <input className="border p-2 rounded" placeholder="Nom du client" value={form.name} onChange={(e)=>setForm({ ...form, name: e.target.value })} required />
        <input className="border p-2 rounded" type="tel" placeholder="Téléphone +221..." value={form.phone} onChange={(e)=>setForm({ ...form, phone: e.target.value })} required />
        <input className="border p-2 rounded" placeholder="Adresse (optionnel)" value={form.address} onChange={(e)=>setForm({ ...form, address: e.target.value })} />
        <input className="border p-2 rounded" placeholder="Notes (optionnel)" value={form.notes} onChange={(e)=>setForm({ ...form, notes: e.target.value })} />
        <button className="bg-green-700 text-white px-3 py-2 rounded">Ajouter client</button>
        {msg && <p className="md:col-span-5 text-xs text-gray-700" role="status">{msg}</p>}
      </form>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Clients ({customers.length})</h3>
          {customers.map((c:any)=><div key={c.id} className="border-b py-2 text-sm">{c.name} - {c.phone}{c.address ? <span className="text-gray-500"> · {c.address}</span> : null}</div>)}
          {!customers.length && <p className="text-gray-500 text-sm">Aucun client enregistré.</p>}
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Dettes non soldées ({debts.length})</h3>
          {debts.map((d:any)=><div key={d.id} className="border-b py-2 text-sm">{d.customer?.name}: {d.balance} FCFA / {d.totalAmount} FCFA <PayDebt debt={d} onPaid={loadDebts} /></div>)}
          {!debts.length && <p className="text-gray-500 text-sm">Aucune dette en cours.</p>}
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
