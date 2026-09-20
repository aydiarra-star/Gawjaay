import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../lib/api';

const DAYS: Array<[string, string]> = [['mon', 'Lundi'], ['tue', 'Mardi'], ['wed', 'Mercredi'], ['thu', 'Jeudi'], ['fri', 'Vendredi'], ['sat', 'Samedi'], ['sun', 'Dimanche']];
const PAYMENT_METHODS = ['CASH', 'WAVE', 'ORANGE_MONEY', 'CARD', 'CREDIT'];

function parseJson<T>(raw: any, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw !== 'string') return raw as T;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/**
 * Paramètres de la boutique (cahier §4) : identité, contact, localisation Sénégal (région/département/commune + GPS),
 * horaires, livraison/retrait, moyens de paiement annoncés, ouverture physique/digitale.
 * Tout est validé et persisté par le serveur (PUT /stores/:id).
 */
export default function StoreSettings() {
  const { storeId } = useParams();
  const [store, setStore] = useState<any>(null);
  const [regions, setRegions] = useState<any[]>([]);
  const [capabilities, setCapabilities] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/stores/${storeId}`).then((r) => {
      const s = r.data;
      setStore(s);
      setForm({
        name: s.name || '', description: s.description || '', category: s.category || '',
        phone: s.phone || '', whatsapp: s.whatsapp || '', email: s.email || '',
        addressText: s.addressText || '', quartier: s.quartier || '',
        regionId: s.regionId || '', departmentId: s.departmentId || '', communeId: s.communeId || '',
        latitude: s.latitude ?? '', longitude: s.longitude ?? '',
        deliveryFees: s.deliveryFees ?? 0, deliveryDelayMinutes: s.deliveryDelayMinutes ?? 60,
        deliveryZones: parseJson<string[]>(s.deliveryZones, []).join(', '),
        allowPickup: !!s.allowPickup, allowDelivery: !!s.allowDelivery,
        paymentMethods: parseJson<string[]>(s.paymentMethods, ['CASH']),
        physicalStatus: s.physicalStatus || 'OPEN', digitalStatus: s.digitalStatus || 'OPEN',
        logoUrl: s.logoUrl || '',
      });
      setHours(parseJson<Record<string, string>>(s.openingHours, {}));
    }).catch((err) => setMsg(err.response?.data?.error || 'Boutique inaccessible'));
    api.get('/regions').then((r) => setRegions(r.data)).catch(() => setRegions([]));
    api.get('/payments/capabilities').then((r) => setCapabilities(r.data)).catch(() => setCapabilities(null));
  }, [storeId]);

  const departments = useMemo(() => regions.find((r) => r.id === form?.regionId)?.departments || [], [regions, form?.regionId]);
  const communes = useMemo(() => departments.find((d: any) => d.id === form?.departmentId)?.communes || [], [departments, form?.departmentId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || busy) return;
    setBusy(true); setMsg('');
    const num = (v: any) => (v === '' || v === null || v === undefined ? undefined : Number(v));
    const payload: any = {
      name: form.name.trim(), description: form.description.trim() || undefined, category: form.category.trim() || undefined,
      phone: form.phone.trim() || undefined, whatsapp: form.whatsapp.trim() || undefined, email: form.email.trim() || undefined,
      addressText: form.addressText.trim() || undefined, quartier: form.quartier.trim() || undefined,
      regionId: form.regionId || null, departmentId: form.departmentId || null, communeId: form.communeId || null,
      latitude: num(form.latitude), longitude: num(form.longitude),
      deliveryFees: num(form.deliveryFees), deliveryDelayMinutes: num(form.deliveryDelayMinutes),
      deliveryZones: String(form.deliveryZones).split(',').map((z: string) => z.trim()).filter(Boolean),
      allowPickup: !!form.allowPickup, allowDelivery: !!form.allowDelivery,
      paymentMethods: form.paymentMethods,
      physicalStatus: form.physicalStatus, digitalStatus: form.digitalStatus,
      openingHours: Object.fromEntries(Object.entries(hours).filter(([, v]) => v && v.trim())),
      logoUrl: form.logoUrl.trim() || undefined,
    };
    try {
      const r = await api.put(`/stores/${storeId}`, payload);
      setStore(r.data);
      setMsg('Paramètres enregistrés.');
    } catch (err: any) { setMsg(err.response?.data?.error || 'Enregistrement refusé par le serveur'); }
    finally { setBusy(false); }
  };

  const locate = () => {
    if (!navigator.geolocation) { setMsg('Géolocalisation non disponible sur cet appareil.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm({ ...form, latitude: Number(pos.coords.latitude.toFixed(6)), longitude: Number(pos.coords.longitude.toFixed(6)) }),
      () => setMsg('Position refusée : saisissez les coordonnées manuellement.'),
    );
  };

  if (!form) return <div><p className="text-sm text-gray-600">{msg || 'Chargement…'}</p></div>;

  const availableCodes = new Set((capabilities?.methods || []).filter((m: any) => m.available).map((m: any) => m.code));
  const publicUrl = `${window.location.origin}/store/${store?.slug}`;
  const field = 'border p-2 rounded w-full';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h1 className="text-xl font-bold">Paramètres — {store?.name}</h1>
        <Link to="/merchant" className="text-green-700 text-sm">← Mes boutiques</Link>
      </div>
      <p className="text-sm text-gray-600 mb-3">Vitrine publique : <a className="text-blue-600 break-all" href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</a></p>
      {msg && <p className="text-sm text-gray-700 mb-3 bg-gray-50 p-2 rounded" role="status">{msg}</p>}

      <form onSubmit={save} className="space-y-4 text-sm">
        <section className="bg-white p-4 rounded shadow grid grid-cols-1 md:grid-cols-2 gap-3">
          <h3 className="font-bold md:col-span-2">Identité & contact</h3>
          <label>Nom<input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} /></label>
          <label>Catégorie<input className={field} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Alimentation, Mode, Électronique…" /></label>
          <label className="md:col-span-2">Description<textarea className={field} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label>Téléphone<input className={field} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+221..." /></label>
          <label>WhatsApp<input className={field} type="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="+221..." /></label>
          <label>Email<input className={field} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Logo (URL)<input className={field} value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://…" /></label>
        </section>

        <section className="bg-white p-4 rounded shadow grid grid-cols-1 md:grid-cols-3 gap-3">
          <h3 className="font-bold md:col-span-3">Localisation (Sénégal)</h3>
          <label>Région
            <select className={field} value={form.regionId} onChange={(e) => setForm({ ...form, regionId: e.target.value, departmentId: '', communeId: '' })}>
              <option value="">—</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label>Département
            <select className={field} value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value, communeId: '' })} disabled={!form.regionId}>
              <option value="">—</option>{departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label>Commune
            <select className={field} value={form.communeId} onChange={(e) => setForm({ ...form, communeId: e.target.value })} disabled={!form.departmentId}>
              <option value="">—</option>{communes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Quartier<input className={field} value={form.quartier} onChange={(e) => setForm({ ...form, quartier: e.target.value })} /></label>
          <label className="md:col-span-2">Adresse<input className={field} value={form.addressText} onChange={(e) => setForm({ ...form, addressText: e.target.value })} /></label>
          <label>Latitude<input className={field} type="number" step="any" min={-90} max={90} value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></label>
          <label>Longitude<input className={field} type="number" step="any" min={-180} max={180} value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></label>
          <div className="flex items-end"><button type="button" onClick={locate} className="border px-3 py-2 rounded">📍 Utiliser ma position</button></div>
          <p className="md:col-span-3 text-xs text-gray-500">Les coordonnées GPS alimentent « Acheter près de moi » (distance réelle calculée par le serveur). Sans coordonnées, la boutique n'apparaît pas dans les recherches par proximité.</p>
        </section>

        <section className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Horaires d'ouverture</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {DAYS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2">
                <span className="w-24">{label}</span>
                <input className="border p-1 rounded flex-1" value={hours[k] || ''} onChange={(e) => setHours({ ...hours, [k]: e.target.value })} placeholder="ex. 08:00-20:00 ou Fermé" />
              </label>
            ))}
          </div>
        </section>

        <section className="bg-white p-4 rounded shadow grid grid-cols-1 md:grid-cols-3 gap-3">
          <h3 className="font-bold md:col-span-3">Commandes en ligne, livraison & retrait</h3>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.allowDelivery} onChange={(e) => setForm({ ...form, allowDelivery: e.target.checked })} /> Livraison proposée</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.allowPickup} onChange={(e) => setForm({ ...form, allowPickup: e.target.checked })} /> Retrait en boutique proposé</label>
          <span />
          <label>Frais de livraison (FCFA)<input className={field} type="number" min={0} step="any" value={form.deliveryFees} onChange={(e) => setForm({ ...form, deliveryFees: e.target.value })} /></label>
          <label>Délai indicatif (minutes)<input className={field} type="number" min={0} max={10080} value={form.deliveryDelayMinutes} onChange={(e) => setForm({ ...form, deliveryDelayMinutes: e.target.value })} /></label>
          <label>Zones livrées (séparées par des virgules)<input className={field} value={form.deliveryZones} onChange={(e) => setForm({ ...form, deliveryZones: e.target.value })} placeholder="Plateau, Médina, Fann" /></label>
        </section>

        <section className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Moyens de paiement annoncés aux clients</h3>
          <div className="flex flex-wrap gap-4">
            {PAYMENT_METHODS.map((m) => {
              const connected = m === 'CASH' || m === 'CREDIT' || availableCodes.has(m);
              return (
                <label key={m} className="flex items-center gap-2">
                  <input type="checkbox" checked={form.paymentMethods.includes(m)} onChange={(e) => setForm({ ...form, paymentMethods: e.target.checked ? [...form.paymentMethods, m] : form.paymentMethods.filter((x: string) => x !== m) })} />
                  {m}{!connected && <span className="text-xs text-orange-700">(non connecté : aucun encaissement en ligne possible)</span>}
                </label>
              );
            })}
          </div>
          {capabilities && !capabilities.productionProviderConnected && (
            <p className="text-xs text-orange-700 mt-2">Aucun fournisseur de paiement mobile n'est connecté sur cette plateforme (mode « {capabilities.mode} ») : seuls les paiements en espèces confirmés par vous sont réellement encaissés.</p>
          )}
        </section>

        <section className="bg-white p-4 rounded shadow grid grid-cols-1 md:grid-cols-2 gap-3">
          <h3 className="font-bold md:col-span-2">Ouverture</h3>
          <label>Boutique physique
            <select className={field} value={form.physicalStatus} onChange={(e) => setForm({ ...form, physicalStatus: e.target.value })}><option value="OPEN">Ouverte</option><option value="CLOSED">Fermée</option></select>
          </label>
          <label>Boutique en ligne (vitrine + marketplace)
            <select className={field} value={form.digitalStatus} onChange={(e) => setForm({ ...form, digitalStatus: e.target.value })}><option value="OPEN">Ouverte</option><option value="CLOSED">Fermée (retirée de la marketplace)</option></select>
          </label>
        </section>

        <button className="bg-green-700 text-white px-6 py-2 rounded disabled:bg-gray-300" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer les paramètres'}</button>
      </form>
    </div>
  );
}
