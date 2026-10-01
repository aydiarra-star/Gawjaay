import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF } from '../lib/format';
import { Alert, EmptyState, Spinner } from '../components/ui';

interface ShopResponse {
  shop: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    region: string | null;
    organization: { name: string; description: string | null; logoUrl: string | null; phone: string | null; email: string | null };
  };
  products: Array<{
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    category: { id: string; name: string } | null;
    price: number;
    originalPrice: number | null;
    variants: Array<{ id: string; name: string; price: number; available: number }>;
  }>;
}

export function ShopPage() {
  const { slug = '' } = useParams();
  const { data, loading, error } = useApi<ShopResponse>(
    () => api.get<ShopResponse>(`/public/shops/${encodeURIComponent(slug)}`, { publicRoute: true }),
    [slug],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" style={{ textDecoration: 'none' }}>
          Gaw<span>Jaay</span>
        </Link>
        <div className="topbar-spacer" />
        <Link to="/marketplace" className="btn btn-secondary btn-sm">
          Marketplace
        </Link>
      </header>

      <main className="main">
        {loading && <Spinner />}
        {error && (
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <Alert kind="error">{error}</Alert>
            <Link to="/marketplace" className="btn btn-secondary">
              Retour à la marketplace
            </Link>
          </div>
        )}
        {data && (
          <>
            <div className="page-head">
              <div>
                <h1>{data.shop.name}</h1>
                <p>
                  {data.shop.description ?? data.shop.organization.name}
                  {data.shop.city ? ` · ${data.shop.city}` : ''}
                  {data.shop.region ? `, ${data.shop.region}` : ''}
                </p>
                {data.shop.phone && <p className="small muted">Tél. {data.shop.phone}</p>}
              </div>
            </div>

            {data.products.length === 0 ? (
              <EmptyState title="Boutique vide" hint="Cette boutique n'a pas encore de produit disponible." />
            ) : (
              <div className="grid grid-cards">
                {data.products.map((p) => {
                  const available = p.variants.reduce((s, v) => s + v.available, 0);
                  return (
                    <article className="card product-card" key={p.id}>
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} loading="lazy" />
                      ) : (
                        <div className="product-thumb" aria-hidden="true">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <h3 style={{ marginTop: 10 }}>{p.name}</h3>
                      {p.category && <span className="badge">{p.category.name}</span>}
                      <p className="stat-value" style={{ fontSize: '1.15rem', marginTop: 8 }}>
                        {formatXOF(p.price)}
                        {p.originalPrice && (
                          <span className="muted small" style={{ textDecoration: 'line-through', marginLeft: 8 }}>
                            {formatXOF(p.originalPrice)}
                          </span>
                        )}
                      </p>
                      <p className="small muted">{available > 0 ? `${available} en stock` : 'Rupture de stock'}</p>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
