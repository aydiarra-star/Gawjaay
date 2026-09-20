import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

export default function StorePublic() {
  const { slug } = useParams();
  const [store, setStore] = useState<any>(null);
  const [cart, setCart] = useState<any[]>([]);

  useEffect(()=>{
    api.get(`/stores/slug/${slug}`).then(r=>setStore(r.data));
  }, [slug]);

  if (!store) return <div>Chargement...</div>;

  const add = (p:any)=>{
    const ex = cart.find(c=>c.productId===p.id);
    if (ex) setCart(cart.map(c=>c.productId===p.id?{...c, quantity:c.quantity+1}:c));
    else setCart([...cart, { productId:p.id, name:p.name, quantity:1, price:p.price }]);
  };

  const order = async ()=>{
    const res = await api.post('/orders', { storeId: store.id, items: cart.map(c=>({ productId:c.productId, quantity:c.quantity })), deliveryType: 'LIVRAISON' });
    alert(`Commande ${res.data.orderNumber} créée - ${res.data.totalAmount} FCFA. Partagez ce lien via WhatsApp!`);
    setCart([]);
  };

  const whatsappLink = `https://wa.me/?text=${encodeURIComponent(`Découvre ma boutique ${store.name} sur GawJaay: ${window.location.href}`)}`;

  return (
    <div>
      <div className="bg-white p-6 rounded shadow mb-6">
        <h1 className="text-3xl font-bold">{store.name}</h1>
        <p className="text-gray-600">{store.description}</p>
        <p className="text-sm mt-2">{store.addressText} - {store.quartier} | Livraison: {store.deliveryFees} FCFA | {store.allowPickup ? 'Retrait possible' : ''}</p>
        <div className="mt-4 flex gap-2">
          <a href={whatsappLink} target="_blank" className="bg-green-500 text-white px-4 py-2 rounded">Partager WhatsApp</a>
          <button onClick={()=>navigator.clipboard.writeText(window.location.href)} className="border px-4 py-2 rounded">Copier lien</button>
          <span className="ml-4 text-xs bg-gray-100 p-2 rounded">QR Code boutique: {store.slug}</span>
        </div>
        <p className="mt-2 text-xs">Statut physique: {store.physicalStatus} | Boutique en ligne: {store.digitalStatus}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {store.products?.map((p:any)=>(
            <div key={p.id} className="bg-white p-4 rounded shadow">
              <h4 className="font-bold">{p.name}</h4>
              <p className="text-sm text-gray-500">{p.description}</p>
              <p className="font-bold text-green-700">{p.price} FCFA</p>
              <button onClick={()=>add(p)} className="mt-2 bg-green-700 text-white px-3 py-1 rounded text-sm">Ajouter</button>
            </div>
          ))}
        </div>
        <div className="bg-white p-4 rounded shadow h-fit">
          <h3 className="font-bold mb-2">Panier ({cart.length})</h3>
          {cart.map((c:any)=><div key={c.productId} className="flex justify-between text-sm"><span>{c.name} x{c.quantity}</span><span>{c.price*c.quantity}</span></div>)}
          <div className="font-bold mt-3">Total: {cart.reduce((s,i)=>s+i.quantity*i.price,0)} FCFA</div>
          <button onClick={order} disabled={!cart.length} className="mt-3 w-full bg-green-700 text-white p-2 rounded disabled:bg-gray-300">Commander</button>
        </div>
      </div>
    </div>
  );
}
