import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

const STATUS_STYLE: Record<string, string> = {
  A_PREPARER: 'bg-yellow-100 text-yellow-800',
  PRET: 'bg-blue-100 text-blue-800',
  EN_LIVRAISON: 'bg-purple-100 text-purple-800',
  LIVRE: 'bg-green-100 text-green-800',
  ANNULE: 'bg-gray-100 text-gray-600',
};

/** LOT E — Livraisons : préparation, assignation livreurs, suivi + preuves (mobile-first). */
export default function Deliveries() {
  const { storeId } = useParams();
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [driverForm, setDriverForm] = useState<any>({ name: '', phone: '', vehicle: 'Moto', password: '' });
  const [assign, setAssign] = useState<any>({});
  const [proofs, setProofs] = useState<any>(null);
  const [msg, setMsg] = useState('');

  const load = () => {
    api.get(`/deliveries/store/${storeId}`).then((r) => setDeliveries(r.data)).catch(() => {});
    api.get('/drivers').then((r) => setDrivers(r.data)).catch(() => {});
  };
  useEffect(load, [storeId]);

  const act = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); setMsg(ok); load(); } catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };
  const addDriver = () => act(
    () => api.post('/drivers', { ...driverForm, password: driverForm.password || undefined }),
    '✅ Livreur ajouté.',
  );
  const viewProofs = async (id: string) => {
    try { setProofs({ id, rows: (await api.get(`/deliveries/${id}/proofs`)).data }); }
    catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Livraisons</h1>
      {msg && <p className="bg-green-50 border border-green-200 text-green-800 p-2 rounded mb-4 text-sm">{msg}</p>}

      <h2 className="font-bold mb-2">Livraisons en cours</h2>
      {deliveries.length === 0 && <p className="text-sm text-gray-500 mb-4">Aucune livraison.</p>}
      {deliveries.map((d: any) => (
        <div key={d.id} className="bg-white p-4 rounded shadow mb-3">
          <div className="flex justify-between items-center gap-2">
            <p className="font-bold text-sm">{d.order?.orderNumber || d.orderId}</p>
            <span className={`text-xs px-2 py-1 rounded ${STATUS_STYLE[d.status] || 'bg-gray-100'}`}>{d.status}</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">Commande : {d.order?.totalAmount} FCFA · {d.type}</p>
          {d.addressText && <p className="text-xs text-gray-500">📍 {d.addressText}</p>}
          {d.failedReason && <p className="text-xs text-red-600">Échec : {d.failedReason}</p>}
          {d.driverId && <p className="text-xs text-gray-500">Livreur : {(drivers.find((x: any) => x.id === d.driverId) || {}).name || d.driverId.slice(0, 8)}</p>}

          <div className="flex flex-wrap gap-2 mt-2">
            {d.status === 'A_PREPARER' && (
              <button className="bg-blue-600 text-white px-3 py-2 rounded text-xs font-bold" onClick={() => act(() => api.patch(`/deliveries/${d.id}/ready`, {}), '✅ Colis prêt.')}>
                Marquer prêt
              </button>
            )}
            {['A_PREPARER', 'PRET'].includes(d.status) && (
              <div className="flex gap-1">
                <select className="border p-2 text-xs rounded" value={assign[d.id] || ''} onChange={(e) => setAssign({ ...assign, [d.id]: e.target.value })}>
                  <option value="">Assigner un livreur…</option>
                  {drivers.filter((x: any) => x.isActive).map((x: any) => <option key={x.id} value={x.id}>{x.name} ({x.vehicle || '—'})</option>)}
                </select>
                <button className="bg-gray-800 text-white px-3 py-2 rounded text-xs font-bold disabled:opacity-40" disabled={!assign[d.id]}
                  onClick={() => act(() => api.post(`/deliveries/${d.id}/assign`, { driverId: assign[d.id] }), '✅ Livreur assigné — code envoyé au client.')}>
                  OK
                </button>
              </div>
            )}
            {['A_PREPARER', 'PRET'].includes(d.status) && (
              <button className="text-red-600 text-xs underline" onClick={() => act(() => api.patch(`/deliveries/${d.id}/cancel`, {}), 'Annulée.')}>
                Annuler
              </button>
            )}
            <button className="text-blue-600 text-xs underline" onClick={() => viewProofs(d.id)}>Preuves</button>
          </div>

          {proofs?.id === d.id && (
            <div className="mt-2 bg-gray-50 p-2 rounded text-xs">
              {proofs.rows.length === 0 && <span>Aucune preuve.</span>}
              {proofs.rows.map((p: any) => (
                <p key={p.id}>{p.type}{p.latitude ? ` (${p.latitude.toFixed(4)}, ${p.longitude?.toFixed(4)})` : ''} — {new Date(p.createdAt).toLocaleString('fr-FR')}</p>
              ))}
            </div>
          )}
        </div>
      ))}

      <h2 className="font-bold mt-6 mb-2">Mes livreurs</h2>
      <div className="bg-white p-4 rounded shadow mb-4 space-y-2">
        <input className="border p-2 w-full text-sm" placeholder="Nom du livreur" value={driverForm.name} onChange={(e) => setDriverForm({ ...driverForm, name: e.target.value })} />
        <input className="border p-2 w-full text-sm" placeholder="Téléphone (+221…)" value={driverForm.phone} onChange={(e) => setDriverForm({ ...driverForm, phone: e.target.value })} />
        <div className="flex gap-2">
          <select className="border p-2 flex-1 text-sm" value={driverForm.vehicle} onChange={(e) => setDriverForm({ ...driverForm, vehicle: e.target.value })}>
            <option>Moto</option><option>Voiture</option><option>Tricycle</option><option>À pied</option>
          </select>
          <input className="border p-2 flex-1 text-sm" type="password" placeholder="Mdp app livreur (8+)" value={driverForm.password} onChange={(e) => setDriverForm({ ...driverForm, password: e.target.value })} />
        </div>
        <button className="w-full bg-blue-600 text-white p-3 rounded font-bold" onClick={addDriver}>Ajouter le livreur</button>
        <p className="text-xs text-gray-500">Avec mot de passe, le livreur accède à l'app livreur (/driver) pour gérer ses courses.</p>
      </div>
      {drivers.map((d: any) => (
        <div key={d.id} className="bg-white p-3 rounded shadow mb-2 flex items-center justify-between">
          <div>
            <p className="font-bold text-sm">{d.name} {d.hasAccount && <span className="text-xs bg-green-100 text-green-700 px-1 rounded">app</span>}</p>
            <p className="text-xs text-gray-500">{d.phone} · {d.vehicle || '—'} · {d.deliveredCount} livrées · {d.activeDeliveries} en cours</p>
          </div>
          <button className={`text-xs underline ${d.isActive ? 'text-red-600' : 'text-green-600'}`}
            onClick={() => act(() => api.patch(`/drivers/${d.id}`, { isActive: !d.isActive }), d.isActive ? 'Désactivé.' : 'Activé.')}>
            {d.isActive ? 'Désactiver' : 'Activer'}
          </button>
        </div>
      ))}
    </div>
  );
}
