import { useEffect, useState } from 'react';
import api from '../../lib/api';

export default function Admin() {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(()=>{
    api.get('/admin/stats').then(r=>setStats(r.data));
    api.get('/admin/users').then(r=>setUsers(r.data));
    api.get('/admin/stores').then(r=>setStores(r.data));
    api.get('/admin/audit-logs').then(r=>setLogs(r.data));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Administration GawJaay</h1>
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded shadow"><p>Utilisateurs</p><p className="text-xl font-bold">{stats.users}</p></div>
          <div className="bg-white p-4 rounded shadow"><p>Boutiques</p><p className="text-xl font-bold">{stats.stores}</p></div>
          <div className="bg-white p-4 rounded shadow"><p>Commandes</p><p className="text-xl font-bold">{stats.orders}</p></div>
          <div className="bg-white p-4 rounded shadow"><p>CA Total</p><p className="text-xl font-bold">{stats.totalSales} FCFA</p></div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Utilisateurs</h3>
          <div className="space-y-1 text-sm max-h-64 overflow-auto">
            {users.map((u:any)=><div key={u.id} className="flex justify-between border-b py-1"><span>{u.phone} ({u.role}) {u.isActive?'✅':'❌'}</span><button onClick={async()=>{ await api.post(`/admin/users/${u.id}/toggle`); api.get('/admin/users').then(r=>setUsers(r.data)); }} className="text-xs text-blue-600">Toggle</button></div>)}
          </div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Boutiques</h3>
          <div className="space-y-1 text-sm max-h-64 overflow-auto">
            {stores.map((s:any)=><div key={s.id} className="flex justify-between border-b py-1"><span>{s.name} {s.isVerified?'✅':'❌'}</span><button onClick={async()=>{ await api.post(`/admin/stores/${s.id}/verify`); api.get('/admin/stores').then(r=>setStores(r.data)); }} className="text-xs text-blue-600">Vérifier</button></div>)}
          </div>
        </div>
      </div>
      <div className="bg-white p-4 rounded shadow mt-6">
        <h3 className="font-bold mb-2">Audit Logs (100 derniers)</h3>
        <div className="space-y-1 text-xs max-h-64 overflow-auto">
          {logs.map((l:any)=><div key={l.id} className="border-b py-1">{new Date(l.createdAt).toLocaleString()} - {l.userId} - {l.action} - {l.resource} {l.resourceId}</div>)}
        </div>
      </div>
      <Moderation />
    </div>
  );
}

/** LOT A — Modération des avis (ADMIN). */
function Moderation() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');

  const load = () => {
    api.get(`/admin/moderation/reviews?filter=${filter}`).then((r) => setReviews(r.data));
    api.get('/admin/moderation/review-reports?status=OPEN').then((r) => setReports(r.data));
  };
  useEffect(load, [filter]);

  const act = async (fn: () => Promise<any>) => { await fn(); load(); };

  return (
    <div className="mt-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
            <h3 className="font-bold">Modération des avis</h3>
            <select className="border p-1 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Tous</option>
              <option value="hidden">Masqués</option>
              <option value="reported">Signalés</option>
            </select>
          </div>
          <div className="space-y-2 text-sm max-h-80 overflow-auto">
            {reviews.map((r: any) => (
              <div key={r.id} className="border-b py-2">
                <p>{'★'.repeat(r.rating)} {r.isHidden && <span className="bg-red-100 text-red-700 text-xs px-1 rounded">masqué</span>} {r.openReports?.length > 0 && <span className="bg-orange-100 text-orange-700 text-xs px-1 rounded">signalé ×{r.openReports.length}</span>}</p>
                <p className="text-gray-600 text-xs">{r.storeName} — {r.comment || '(sans commentaire)'}</p>
                <div className="flex gap-2 mt-1">
                  {!r.isHidden && <button onClick={() => act(() => api.post(`/admin/moderation/reviews/${r.id}/hide`, { reason: 'modération' }))} className="text-xs border px-2 rounded">Masquer</button>}
                  {r.isHidden && <button onClick={() => act(() => api.post(`/admin/moderation/reviews/${r.id}/restore`))} className="text-xs border px-2 rounded">Restaurer</button>}
                  <button onClick={() => { if (confirm('Supprimer définitivement cet avis ?')) act(() => api.delete(`/admin/moderation/reviews/${r.id}`)); }} className="text-xs border border-red-300 text-red-600 px-2 rounded">Supprimer</button>
                </div>
              </div>
            ))}
            {!reviews.length && <p className="text-gray-500">Aucun avis.</p>}
          </div>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Signalements ouverts</h3>
          <div className="space-y-2 text-sm max-h-80 overflow-auto">
            {reports.map((r: any) => (
              <div key={r.id} className="border-b py-2">
                <p className="text-xs text-gray-600">{r.reason} — {r.storeName}</p>
                <p className="text-xs">{'★'.repeat(r.rating)} {r.comment || ''}</p>
                <div className="flex gap-2 mt-1">
                  <button onClick={() => act(() => api.post(`/admin/moderation/review-reports/${r.id}/resolve`, { action: 'HIDE', reason: r.reason }))} className="text-xs border px-2 rounded">Masquer l'avis</button>
                  <button onClick={() => act(() => api.post(`/admin/moderation/review-reports/${r.id}/resolve`, { action: 'REJECT', reason: 'avis conforme' }))} className="text-xs border px-2 rounded">Rejeter le signalement</button>
                </div>
              </div>
            ))}
            {!reports.length && <p className="text-gray-500">Aucun signalement ouvert.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
