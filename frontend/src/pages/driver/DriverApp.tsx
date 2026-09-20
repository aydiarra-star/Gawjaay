import { useEffect, useState } from 'react';
import api from '../../lib/api';

/**
 * LOT E — App livreur : courses assignées, enlèvement, remise avec preuve.
 * Le code OTP est envoyé au client par le serveur — le livreur le saisit sur place.
 */
export default function DriverApp() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [otp, setOtp] = useState<any>({});
  const [to, setTo] = useState<any>({});
  const [photos, setPhotos] = useState<any>({});
  const [msg, setMsg] = useState('');

  const load = () => { api.get('/deliveries/driver/me').then((r) => setJobs(r.data)).catch((e) => setMsg(e.response?.data?.error || 'Erreur')); };
  useEffect(load, []);

  const pickPhoto = (id: string, file: File | undefined) => {
    if (!file) return;
    if (file.size > 500_000) return setMsg('Photo trop lourde (max 500 Ko).');
    const reader = new FileReader();
    reader.onload = () => setPhotos({ ...photos, [id]: reader.result });
    reader.readAsDataURL(file);
  };
  const gps = () => new Promise<{ lat?: number; lng?: number }>((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}), { timeout: 4000 },
    );
  });

  const act = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); setMsg(ok); load(); } catch (e: any) { setMsg(e.response?.data?.error || 'Erreur'); }
  };
  const complete = (d: any) => act(async () => {
    const pos = await gps();
    await api.patch(`/deliveries/${d.id}/complete`, {
      otp: otp[d.id] || undefined, photo: photos[d.id] || undefined, deliveredTo: to[d.id] || undefined, ...pos,
    });
  }, '✅ Livraison confirmée.');
  const fail = (d: any) => {
    const reason = window.prompt('Motif de l échec ?') || '';
    if (!reason.trim()) return;
    act(() => api.patch(`/deliveries/${d.id}/fail`, { reason }), 'Échec enregistré — colis retourné au commerçant.');
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Mes livraisons</h1>
      <p className="text-sm text-gray-600 mb-4">Récupérez le colis puis faites valider le code par le client à la remise.</p>
      {msg && <p className="bg-blue-50 border p-2 rounded mb-4 text-sm">{msg}</p>}
      {jobs.length === 0 && <p className="text-sm text-gray-500">Aucune course en cours. 🎉</p>}
      {jobs.map((d: any) => (
        <div key={d.id} className="bg-white p-4 rounded shadow mb-4">
          <div className="flex justify-between items-center">
            <p className="font-bold">{d.orderNumber}</p>
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{d.status}</span>
          </div>
          <p className="text-sm mt-1">🏪 {d.storeName}</p>
          {d.address?.label && <p className="text-sm">📍 {d.address.label}</p>}
          {d.address?.description && <p className="text-xs text-gray-500">{d.address.description}</p>}
          <p className="text-sm">💰 {d.totalAmount} FCFA (paiement boutique)</p>

          {d.status === 'PRET' && (
            <button className="mt-3 w-full bg-blue-600 text-white p-3 rounded font-bold" onClick={() => act(() => api.patch(`/deliveries/${d.id}/pickup`, {}), 'Colis récupéré — en route !')}>
              Récupérer le colis
            </button>
          )}
          {d.status === 'EN_LIVRAISON' && (
            <div className="mt-3 space-y-2">
              <input className="border p-2 w-full" inputMode="numeric" maxLength={6} placeholder="Code client (6 chiffres)"
                value={otp[d.id] || ''} onChange={(e) => setOtp({ ...otp, [d.id]: e.target.value })} />
              <input className="border p-2 w-full" placeholder="Reçu par (nom, optionnel)" value={to[d.id] || ''} onChange={(e) => setTo({ ...to, [d.id]: e.target.value })} />
              <label className="block text-xs text-gray-600">
                Photo preuve (optionnelle, max 500 Ko)
                <input className="border p-2 w-full text-xs" type="file" accept="image/*" onChange={(e) => pickPhoto(d.id, e.target.files?.[0])} />
              </label>
              {photos[d.id] && <p className="text-xs text-green-700">✓ Photo jointe</p>}
              <button className="w-full bg-green-600 text-white p-3 rounded font-bold" onClick={() => complete(d)}>Livré ✓</button>
              <button className="w-full text-red-600 text-sm underline" onClick={() => fail(d)}>Signaler un échec</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
