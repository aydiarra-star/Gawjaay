import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../lib/api';

const RESOURCE_LABELS: Record<string, string> = {
  sales: 'Ventes', stock: 'Stock', orders: 'Commandes', customers: 'Clients', products: 'Produits', cash: 'Caisse',
  promotions: 'Promotions', coupons: 'Coupons', deliveries: 'Livraisons', expenses: 'Dépenses', suppliers: 'Fournisseurs', reports: 'Rapports',
};
const ACTION_LABELS: Record<string, string> = { read: 'voir', create: 'créer', update: 'modifier', delete: 'supprimer', '*': 'tout' };

function parsePerms(raw: any): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } }
  return [];
}

const ACTIONS = ['read', 'create', 'update', 'delete', '*'];
const toggle = (list: string[], perm: string) => (list.includes(perm) ? list.filter((p) => p !== perm) : [...list, perm]);

/** Grille ressource × action construite à partir du catalogue réel du serveur. */
function PermGrid({ grid, value, onChange }: { grid: Array<[string, string[]]>; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead><tr><th className="text-left pr-2">Ressource</th>{ACTIONS.map((a) => <th key={a} className="px-1">{ACTION_LABELS[a]}</th>)}</tr></thead>
        <tbody>
          {grid.map(([res, acts]) => (
            <tr key={res}>
              <td className="pr-2">{RESOURCE_LABELS[res] || res}</td>
              {ACTIONS.map((a) => (
                <td key={a} className="text-center px-1">
                  {acts.includes(a) && <input type="checkbox" aria-label={`${res}:${a}`} checked={value.includes(`${res}:${a}`)} onChange={() => onChange(toggle(value, `${res}:${a}`))} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Employés d'une boutique (cahier §5) : création d'un compte EMPLOYEE, permissions granulaires, activation. */
export default function Employees() {
  const { storeId } = useParams();
  const [employees, setEmployees] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [form, setForm] = useState({ phone: '', password: '', roleLabel: 'Vendeur', permissions: ['sales:*', 'stock:read', 'orders:*', 'customers:*'] as string[] });
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState<{ id: string; permissions: string[] } | null>(null);

  const load = () => api.get(`/employees/store/${storeId}`).then((r) => setEmployees(r.data)).catch(() => setEmployees([]));
  useEffect(() => {
    load();
    api.get('/employees/permissions/catalog').then((r) => setCatalog(r.data.permissions || [])).catch(() => setCatalog([]));
  }, [storeId]);

  const grid = useMemo<Array<[string, string[]]>>(() => {
    const byRes = new Map<string, string[]>();
    for (const p of catalog) { const [res, act] = p.split(':'); if (!byRes.has(res)) byRes.set(res, []); byRes.get(res)!.push(act); }
    return [...byRes.entries()];
  }, [catalog]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    try {
      await api.post(`/employees/store/${storeId}`, { phone: form.phone.trim(), password: form.password, roleLabel: form.roleLabel.trim(), permissions: form.permissions });
      setForm({ ...form, phone: '', password: '' });
      setMsg('Employé créé : il peut se connecter avec son téléphone et son mot de passe.');
      load();
    } catch (err: any) { setMsg(err.response?.data?.error || 'Création refusée'); }
  };

  const savePerms = async () => {
    if (!editing) return;
    try { await api.patch(`/employees/${editing.id}/permissions`, { permissions: editing.permissions }); setEditing(null); setMsg('Permissions mises à jour.'); load(); }
    catch (err: any) { setMsg(err.response?.data?.error || 'Mise à jour refusée'); }
  };

  const setActive = async (emp: any, active: boolean) => {
    if (!window.confirm(`${active ? 'Réactiver' : 'Désactiver'} l'accès de ${emp.user?.phone} ?`)) return;
    try { await api.post(`/employees/${emp.id}/${active ? 'reactivate' : 'deactivate'}`, {}); load(); }
    catch (err: any) { setMsg(err.response?.data?.error || 'Opération refusée'); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h1 className="text-xl font-bold">Employés</h1>
        <Link to="/merchant" className="text-green-700 text-sm">← Mes boutiques</Link>
      </div>
      {msg && <p className="text-sm text-gray-700 mb-3 bg-gray-50 p-2 rounded" role="status">{msg}</p>}

      <form onSubmit={create} className="bg-white p-4 rounded shadow mb-4 text-sm space-y-3">
        <h3 className="font-bold">Nouvel employé</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input className="border p-2 rounded" type="tel" placeholder="Téléphone +221..." value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          <input className="border p-2 rounded" type="password" autoComplete="new-password" placeholder="Mot de passe initial (8+ car., majuscule, chiffre)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <input className="border p-2 rounded" placeholder="Poste (ex. Vendeur, Caissier)" value={form.roleLabel} onChange={(e) => setForm({ ...form, roleLabel: e.target.value })} required />
        </div>
        <details>
          <summary className="cursor-pointer text-green-700">Permissions ({form.permissions.length})</summary>
          <div className="mt-2"><PermGrid grid={grid} value={form.permissions} onChange={(permissions) => setForm({ ...form, permissions })} /></div>
        </details>
        <button className="bg-green-700 text-white px-4 py-2 rounded">Créer l'employé</button>
      </form>

      <div className="bg-white p-4 rounded shadow text-sm">
        <h3 className="font-bold mb-2">Équipe ({employees.length})</h3>
        {!employees.length && <p className="text-gray-500">Aucun employé pour cette boutique.</p>}
        <div className="space-y-2">
          {employees.map((emp: any) => {
            const perms = parsePerms(emp.permissions);
            const active = emp.isActive !== 0 && emp.isActive !== false && emp.user?.isActive !== 0 && emp.user?.isActive !== false;
            return (
              <div key={emp.id} className="border rounded p-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <span><span className="font-semibold">{emp.user?.phone}</span> · {emp.roleLabel} {!active && <span className="text-red-600 text-xs">(désactivé)</span>}</span>
                  <span className="text-xs text-gray-500">Dernière connexion : {emp.user?.lastLoginAt ? new Date(emp.user.lastLoginAt).toLocaleString('fr-FR') : 'jamais'}</span>
                </div>
                <p className="text-xs text-gray-600 mt-1">Permissions : {perms.length ? perms.join(', ') : 'aucune'}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <button onClick={() => setEditing(editing?.id === emp.id ? null : { id: emp.id, permissions: perms })} className="border px-2 py-1 rounded text-xs">Modifier permissions</button>
                  {active
                    ? <button onClick={() => setActive(emp, false)} className="border border-red-600 text-red-600 px-2 py-1 rounded text-xs">Désactiver</button>
                    : <button onClick={() => setActive(emp, true)} className="border border-green-700 text-green-700 px-2 py-1 rounded text-xs">Réactiver</button>}
                </div>
                {editing && editing.id === emp.id && (
                  <div className="mt-2 space-y-2">
                    <PermGrid grid={grid} value={editing.permissions} onChange={(permissions) => setEditing({ id: emp.id, permissions })} />
                    <div className="flex gap-2">
                      <button onClick={savePerms} className="bg-green-700 text-white px-3 py-1 rounded text-xs">Enregistrer</button>
                      <button onClick={() => setEditing(null)} className="border px-3 py-1 rounded text-xs">Annuler</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
