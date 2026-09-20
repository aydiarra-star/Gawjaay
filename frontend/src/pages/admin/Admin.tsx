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
    </div>
  );
}
