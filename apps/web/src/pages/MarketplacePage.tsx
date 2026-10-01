import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF } from '../lib/format';
import { Alert, EmptyState, Spinner } from '../components/ui';

interface Offer {
  storeId: string;
  storeName: string;
  storeSlug: string;
  city: string | null;
  region: string | null;
  variantId: string;
  variantName: string;
  available: number;
  distanceKm: number | null;
}
interface MarketplaceItem {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  category: { id: string; name: string } | null;
  price: number;
  originalPrice: number | null;
  offers: Offer[];
}
interface MarketplaceResponse {
  items: MarketplaceItem[];
  categories: Array<{ id: string; name: string; slug: string }>;
}

export function MarketplacePage() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [query, setQuery] = useState({ search: '', categoryId: '' });

  const { data, loading, error } = useApi<MarketplaceResponse>(
    () => {
      const params = new URLSearchParams();
      if (query.search) params.set('search', query.search);
      if (query.categoryId) params.set('categoryId', query.categoryId);
      const qs = params.toString();
      return api.get<MarketplaceResponse>(`/public/marketplace${qs ? `?${qs}` : ''}`, { publicRoute: true });
    },
    [query.search, query.categoryId],
  );

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery({ search, categoryId });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" style={{ textDecoration: 'none' }}>
          Gaw<span>Jaay</span>
        </Link>
        <div className="topbar-spacer" />
        <div className="row">
          <Link to="/login" className="btn btn-secondary btn-sm">
            Connexion
          </Link>
          <Link to="/register" className="btn btn-sm">
            Vendre
          </Link>
        </div>
      </header>

      <main className="main">
        <div className="page-head">
          <div>
            <h1>Marketplace</h1>
            <p>Produits réellement disponibles en stock dans les boutiques GawJaay.</p>
          </div>
        </div>

        <form className="card" onSubmit={onSearch} role="search">
          <div className="form-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="m-search">Rechercher</label>
              <input id="m-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom du produit…" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="m-cat">Catégorie</label>
              <select id="m-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Toutes</option>
                {(data?.categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn" type="submit">
              Rechercher
            </button>
          </div>
        </form>

        <div style={{ marginTop: 16 }}>
          {loading && <Spinner />}
          {error && <Alert kind="error">{error}</Alert>}
          {!loading && !error && (data?.items.length ?? 0) === 0 && (
            <EmptyState title="Aucun produit disponible" hint="Aucun produit n'est actuellement en stock dans une boutique publique." />
          )}
          {!loading && !error && (data?.items.length ?? 0) > 0 && (
            <div className="grid grid-cards">
              {data!.items.map((item) => (
                <article className="card product-card" key={item.id}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} loading="lazy" />
                  ) : (
                    <div className="product-thumb" aria-hidden="true">
                      {item.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <h3 style={{ marginTop: 10 }}>{item.name}</h3>
                  {item.category && <span className="badge">{item.category.name}</span>}
                  <p className="stat-value" style={{ fontSize: '1.15rem', marginTop: 8 }}>
                    {formatXOF(item.price)}
                    {item.originalPrice && (
                      <span className="muted small" style={{ textDecoration: 'line-through', marginLeft: 8 }}>
                        {formatXOF(item.originalPrice)}
                      </span>
                    )}
                  </p>
                  {item.offers.length > 0 && (
                    <div className="small muted" style={{ marginTop: 6 }}>
                      Disponible chez{' '}
                      <Link to={`/shop/${item.offers[0].storeSlug}`}>{item.offers[0].storeName}</Link>
                      {item.offers[0].distanceKm != null && <> · à {item.offers[0].distanceKm} km</>}
                      {item.offers.length > 1 && <> · {item.offers.length} boutiques</>}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
