import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

/** LOT C — Fidélité : configuration marchand + comptes clients (mobile-first). */
export default function Loyalty() {
  const { storeId } = useParams();
  const [cfg, setCfg] = useState<any>({ loyaltyEnabled: false, loyaltyEarnRate: 10, loyaltyRedeemValue: 10 });
  const [accounts, setAccounts] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get(`/loyalty/store/${storeId}/accounts`).then((r) => setAccounts(r.data)).catch(() => {});
    api.get(`/analytics/store/${storeId}`).catch(() => {});
    api.get(`/stores/my`).then((r) => {
      const s = r.data.find((x: any) => x.id === storeId);
      if (s) setCfg({ loyaltyEnabled: !!s.loyaltyEnabled, loyaltyEarnRate: s.loyaltyEarnRate ?? 10, loyaltyRedeemValue: s.loyaltyRedeemValue ?? 10 });
    });
  }, [storeId]);

  const save = async () => {
    try {
      await api.put(`/loyalty/store/${storeId}/config`, cfg);
      setMsg('✅ Programme enregistré.');
    } catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Fidélité</h1>
      {msg && <p className="bg-green-50 border border-green-200 text-green-800 p-2 rounded mb-4 text-sm">{msg}</p>}
      <div className="bg-white p-4 rounded shadow mb-6 space-y-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={cfg.loyaltyEnabled} onChange={(e) => setCfg({ ...cfg, loyaltyEnabled: e.target.checked })} />
          <span className="font-bold">Activer le programme de fidélité</span>
        </label>
        <div className="flex gap-2">
          <label className="flex-1 text-sm">Points par 1000 FCFA d'achat
            <input className="border p-2 w-full" type="number" min="0" value={cfg.loyaltyEarnRate} onChange={(e) => setCfg({ ...cfg, loyaltyEarnRate: parseInt(e.target.value) || 0 })} />
          </label>
          <label className="flex-1 text-sm">Valeur d'1 point (FCFA)
            <input className="border p-2 w-full" type="number" min="1" value={cfg.loyaltyRedeemValue} onChange={(e) => setCfg({ ...cfg, loyaltyRedeemValue: parseInt(e.target.value) || 1 })} />
          </label>
        </div>
        <button onClick={save} className="bg-green-700 text-white px-4 py-2 rounded w-full">Enregistrer</button>
        <p className="text-xs text-gray-500">Points calculés côté serveur sur les montants réellement payés. Historique complet.</p>
      </div>

      <div className="bg-white p-4 rounded shadow">
        <h3 className="font-bold mb-2">Comptes clients ({accounts.length})</h3>
        <div className="space-y-1 text-sm max-h-80 overflow-auto">
          {accounts.map((a: any) => (
            <div key={a.id} className="flex justify-between border-b py-1">
              <span>{a.customerName || a.clientPhone}</span>
              <span className="font-bold">{a.points} points</span>
            </div>
          ))}
          {!accounts.length && <p className="text-gray-500">Aucun compte fidélité encore.</p>}
        </div>
      </div>
    </div>
  );
}
