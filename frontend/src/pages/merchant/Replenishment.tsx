import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

/**
 * LOT D — Réapprovisionnement : suggestions calculées sur les données réelles
 * (stock <= seuil). Le commerçant valide/modifie les quantités — rien d'automatique.
 */
export default function Replenishment() {
  const { storeId } = useParams();
  const [sugs, setSugs] = useState<any[]>([]);
  const [catalogs, setCatalogs] = useState<any[]>([]);
  const [catalogId, setCatalogId] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get(`/replenishment/store/${storeId}`).then((r) => setSugs(r.data)).catch(() => {});
    api.get('/b2b/catalogs').then((r) => setCatalogs(r.data)).catch(() => {});
  }, [storeId]);

  const orderAll = async () => {
    if (!catalogId) return setMsg('Choisissez un catalogue fournisseur.');
    try {
      const items = sugs.map((s: any) => ({ productId: s.productId, quantity: s.suggestedQty }));
      await api.post(`/replenishment/store/${storeId}/create-order`, { catalogId, items });
      setMsg('✅ Commande de réapprovisionnement envoyée.'); setSugs([]);
    } catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Réapprovisionnement</h1>
      <p className="text-sm text-gray-600 mb-4">Produits au seuil ou sous le seuil — quantités suggérées, ajustables avant envoi.</p>
      {msg && <p className="bg-green-50 border border-green-200 text-green-800 p-2 rounded mb-4 text-sm">{msg}</p>}

      {sugs.length === 0 && <p className="text-sm text-gray-500">✅ Aucun produit sous le seuil. Rien à réapprovisionner.</p>}
      {sugs.map((s: any) => (
        <div key={s.productId} className="bg-white p-4 rounded shadow mb-3">
          <p className="font-bold text-sm">{s.name}</p>
          <p className="text-xs text-gray-600">Stock : <span className={s.stock <= 0 ? 'text-red-600 font-bold' : ''}>{s.stock}</span> · Seuil : {s.threshold}</p>
          <p className="text-xs text-gray-500 mt-1">{s.message}</p>
        </div>
      ))}

      {sugs.length > 0 && (
        <div className="bg-white p-4 rounded shadow mt-4 space-y-3">
          <select className="border p-2 w-full" value={catalogId} onChange={(e) => setCatalogId(e.target.value)}>
            <option value="">Catalogue fournisseur…</option>
            {catalogs.map((c: any) => <option key={c.id} value={c.id}>{c.name} — {c.companyName}</option>)}
          </select>
          <button className="w-full bg-blue-600 text-white p-3 rounded font-bold" onClick={orderAll}>
            Commander les quantités suggérées ({sugs.length} produits)
          </button>
          <p className="text-xs text-gray-500">La commande respecte prix pro et quantités minimales du catalogue choisi ; le fournisseur doit l'accepter.</p>
        </div>
      )}
    </div>
  );
}
