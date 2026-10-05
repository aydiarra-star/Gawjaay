import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SENEGAL_REGIONS } from '@gawjaay/shared';
import { api, ApiError } from '../lib/api';
import { Alert, Card, PageHead, Spinner } from '../components/ui';

interface Seller {
  id: string;
  sellerType: string;
  displayName: string;
  bio: string | null;
  phone: string | null;
  city: string | null;
  region: string | null;
}
interface Listing {
  id: string;
  title: string;
  description: string | null;
  condition: string | null;
  price: number | null;
  quantity: number | null;
  city: string | null;
  region: string | null;
  fulfillment: string;
  status: string;
  priceInfo?: { effectivePrice: number | null; quantity: number | null };
}

export function SellerHubPage() {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [form, setForm] = useState({ title: '', description: '', price: '', quantity: '1', condition: 'USED', region: 'Dakar', city: '', fulfillment: 'PICKUP' });
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([
        api.get<{ sellers: Seller[] }>('/sellers'),
        api.get<{ listings: Listing[] }>('/listings'),
      ]);
      setSeller(s.sellers[0] ?? null);
      setListings(l.listings);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  function reset() {
    setEditing(null);
    setForm({ title: '', description: '', price: '', quantity: '1', condition: 'USED', region: seller?.region ?? 'Dakar', city: seller?.city ?? '', fulfillment: 'PICKUP' });
  }

  function edit(l: Listing) {
    setEditing(l.id);
    setForm({
      title: l.title,
      description: l.description ?? '',
      price: String(l.price ?? ''),
      quantity: String(l.quantity ?? 1),
      condition: l.condition ?? 'USED',
      region: l.region ?? 'Dakar',
      city: l.city ?? '',
      fulfillment: l.fulfillment,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        price: Number(form.price),
        quantity: Number(form.quantity),
        condition: form.condition || undefined,
        region: form.region || undefined,
        city: form.city.trim() || undefined,
        fulfillment: form.fulfillment,
      };
      if (editing) await api.patch(`/listings/${editing}`, payload);
      else await api.post('/listings', payload);
      reset();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enregistrement impossible');
    } finally { setBusy(false); }
  }

  async function toggle(l: Listing) {
    try {
      await api.patch(`/listings/${l.id}`, { status: l.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Modification impossible'); }
  }

  async function remove(l: Listing) {
    if (!window.confirm('Retirer cette annonce de la marketplace ?')) return;
    try { await api.delete(`/listings/${l.id}`); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Suppression impossible'); }
  }

  if (loading) return <div className="center-page"><Spinner /></div>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" style={{ textDecoration: 'none' }}><span className="brand-mark">G</span>Gaw<span>Jaay</span></Link>
        <div className="topbar-spacer" />
        <Link to="/marketplace" className="btn btn-secondary btn-sm">Marketplace</Link>
      </header>
      <main className="main">
        <PageHead title="Mon espace vendeur" subtitle="Publiez, modifiez, mettez en pause ou retirez vos annonces. Vous gardez le contrôle." />
        {error && <Alert kind="error">{error}</Alert>}
        {!seller ? <Card title="Profil vendeur manquant"><p>Votre profil vendeur doit être créé avant de publier.</p></Card> : (
          <>
            <Card title={editing ? 'Modifier mon annonce' : 'Publier un article'}>
              <div className="form-row">
                <div className="field"><label>Titre</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ex. Veste, téléphone, meuble…" /></div>
                <div className="field"><label>Prix (FCFA)</label><input inputMode="numeric" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} /></div>
              </div>
              <div className="form-row">
                <div className="field"><label>Quantité</label><input type="number" min="0" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
                <div className="field"><label>État</label><select value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}><option value="USED">Occasion</option><option value="NEW">Neuf</option></select></div>
              </div>
              <div className="field"><label>Description</label><textarea rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
              <div className="form-row">
                <div className="field"><label>Région</label><select value={form.region} onChange={e => setForm({ ...form, region: e.target.value })}>{SENEGAL_REGIONS.map(r => <option key={r.code} value={r.name}>{r.name}</option>)}</select></div>
                <div className="field"><label>Ville</label><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
              </div>
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <button className="btn btn-lg" onClick={() => void save()} disabled={busy || form.title.trim().length < 2 || Number(form.price) <= 0}>{busy ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : 'Publier sur GawJaay'}</button>
                {editing && <button className="btn btn-secondary" onClick={reset}>Annuler</button>}
              </div>
            </Card>

            <Card title="Mes annonces" style={{ marginTop: 16 } as never}>
              {listings.length === 0 ? <p className="muted">Aucune annonce pour le moment.</p> : <div className="stack">
                {listings.map(l => <div className="card" key={l.id} style={{ padding: 16 }}>
                  <div className="row between" style={{ gap: 12 }}><div><strong>{l.title}</strong><div className="small muted">{l.city || l.region || 'Localisation non renseignée'} · {l.status === 'ACTIVE' ? 'Publiée' : 'En pause'}</div></div><strong>{l.price?.toLocaleString('fr-FR')} FCFA</strong></div>
                  <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => edit(l)}>Modifier</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => void toggle(l)}>{l.status === 'ACTIVE' ? 'Mettre en pause' : 'Republier'}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => void remove(l)}>Retirer</button>
                  </div>
                </div>)}
              </div>}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
