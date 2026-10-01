import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF } from '../lib/format';
import { Alert, Card, EmptyState, PageHead, Spinner } from '../components/ui';

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  promoPrice: number | null;
  purchasePrice: number;
  alertThreshold: number;
  marketplaceVisible: boolean;
  category: { id: string; name: string } | null;
  variants: Array<{ id: string; name: string; sku: string }>;
}

interface ProductsResponse {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}

const EMPTY_FORM = { name: '', sku: '', price: '', purchasePrice: '', alertThreshold: '', marketplaceVisible: false, variantName: 'Standard', variantSku: '' };

export function ProductsPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error: loadError, reload } = useApi<ProductsResponse>(
    () => api.get<ProductsResponse>(`/products?pageSize=100${query ? `&search=${encodeURIComponent(query)}` : ''}`),
    [query],
  );

  function update(key: keyof typeof form, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name || !form.sku) {
      setError('Le nom et le SKU sont requis.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/products', {
        name: form.name,
        sku: form.sku,
        price: Number(form.price || 0),
        purchasePrice: Number(form.purchasePrice || 0),
        alertThreshold: Number(form.alertThreshold || 0),
        marketplaceVisible: form.marketplaceVisible,
        variants: [{ name: form.variantName || 'Standard', sku: form.variantSku || `${form.sku}-STD` }],
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title="Produits"
        subtitle="Catalogue de votre organisation."
        actions={
          <button className="btn" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Fermer' : '+ Nouveau produit'}
          </button>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}

      {showForm && (
        <Card title="Nouveau produit">
          <form onSubmit={onCreate} noValidate>
            <div className="form-row">
              <div className="field">
                <label htmlFor="p-name">Nom</label>
                <input id="p-name" required value={form.name} onChange={(e) => update('name', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="p-sku">SKU</label>
                <input id="p-sku" required value={form.sku} onChange={(e) => update('sku', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="p-price">Prix de vente (FCFA)</label>
                <input id="p-price" type="number" min="0" value={form.price} onChange={(e) => update('price', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="p-cost">Prix d'achat (FCFA)</label>
                <input id="p-cost" type="number" min="0" value={form.purchasePrice} onChange={(e) => update('purchasePrice', e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label htmlFor="p-threshold">Seuil d'alerte stock</label>
                <input id="p-threshold" type="number" min="0" value={form.alertThreshold} onChange={(e) => update('alertThreshold', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="p-variant">Nom de la variante</label>
                <input id="p-variant" value={form.variantName} onChange={(e) => update('variantName', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={form.marketplaceVisible}
                  onChange={(e) => update('marketplaceVisible', e.target.checked)}
                />
                Afficher sur la marketplace
              </label>
            </div>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
        </Card>
      )}

      <Card
        title="Catalogue"
        actions={
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search);
            }}
          >
            <input aria-label="Rechercher" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" style={{ width: 180 }} />
            <button className="btn btn-secondary btn-sm" type="submit">
              OK
            </button>
          </form>
        }
      >
        {loading && <Spinner />}
        {loadError && <Alert kind="error">{loadError}</Alert>}
        {data && data.items.length === 0 && <EmptyState title="Aucun produit" hint="Créez votre premier produit pour commencer." />}
        {data && data.items.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>SKU</th>
                  <th className="num">Prix</th>
                  <th className="num">Achat</th>
                  <th className="num">Variantes</th>
                  <th>Marketplace</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="small muted">{p.sku}</td>
                    <td className="num">{formatXOF(p.promoPrice ?? p.price)}</td>
                    <td className="num">{formatXOF(p.purchasePrice)}</td>
                    <td className="num">{p.variants.length}</td>
                    <td>{p.marketplaceVisible ? <span className="badge badge-primary">Oui</span> : <span className="badge">Non</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
