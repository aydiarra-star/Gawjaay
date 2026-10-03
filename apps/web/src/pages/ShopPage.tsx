import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF } from '../lib/format';
import { Alert, EmptyState, SkeletonGrid } from '../components/ui';
import { IconMapPin, IconPackage, IconStore } from '../components/icons';
import { ProductDownloadButton, TerangaBanner } from '../components/premium';

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

  const totalAvailable = (data?.products ?? []).reduce(
    (s, p) => s + p.variants.reduce((v, x) => v + x.available, 0),
    0,
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" style={{ textDecoration: 'none' }}>
          <span className="brand-mark">G</span>
          Gaw<span>Jaay</span>
        </Link>
        <div className="topbar-spacer" />
        <Link to="/marketplace" className="btn btn-secondary btn-sm">
          Marketplace
        </Link>
      </header>

      <main className="main">
        <div className="main-inner">
          {loading && <SkeletonGrid count={6} />}
          {error && (
            <div style={{ maxWidth: 560, margin: '40px auto' }}>
              <Alert kind="error">{error}</Alert>
              <Link to="/marketplace" className="btn btn-secondary">
                Retour à la marketplace
              </Link>
            </div>
          )}

          {data && (
            <>
              {/* Bandeau boutique : identité de mini-marque */}
              <div
                className="card"
                style={{
                  padding: '28px 24px',
                  background: 'linear-gradient(150deg, var(--surface) 0%, var(--surface-2) 100%)',
                }}
              >
                <div className="row" style={{ gap: 18, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <span
                    className="avatar"
                    style={{ width: 64, height: 64, fontSize: '1.6rem', borderRadius: 18, background: 'var(--brand-soft)' }}
                  >
                    {data.shop.name.charAt(0).toUpperCase()}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h1 style={{ marginBottom: 4 }}>{data.shop.name}</h1>
                    <p className="muted small">
                      {data.shop.description ?? data.shop.organization.name}
                    </p>
                    <div className="row" style={{ gap: 10, marginTop: 12 }}>
                      {(data.shop.city || data.shop.region) && (
                        <span className="badge">
                          <IconMapPin size={13} />
                          {[data.shop.city, data.shop.region].filter(Boolean).join(', ')}
                        </span>
                      )}
                      <span className="badge badge-primary">
                        <IconPackage size={13} />
                        {data.products.length} produit{data.products.length > 1 ? 's' : ''}
                      </span>
                      {totalAvailable > 0 && <span className="badge badge-success">{totalAvailable} en stock</span>}
                      {data.shop.phone && <span className="badge">{data.shop.phone}</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div className="section">
                <div className="section-head">
                  <div>
                    <div className="section-title">Catalogue</div>
                    <div className="section-sub">Produits publiés par cette boutique</div>
                  </div>
                </div>

                <TerangaBanner
                  eyebrow="Boutique"
                  title={`Bienvenue chez ${data.shop.name}`}
                  body="Produits disponibles en stock, au prix affiché par la boutique. Téléchargez la fiche d'un produit pour la conserver ou la partager."
                />

                {data.products.length === 0 ? (
                  <div className="card">
                    <EmptyState
                      title="Boutique vide"
                      hint="Cette boutique n'a pas encore publié de produit disponible."
                      icon={<IconStore size={22} />}
                    />
                  </div>
                ) : (
                  <div className="product-grid">
                    {data.products.map((p) => {
                      const available = p.variants.reduce((s, v) => s + v.available, 0);
                      return (
                        <article className="product-card" key={p.id}>
                          <div className="product-media">
                            {p.imageUrl ? (
                              <img src={p.imageUrl} alt={p.name} loading="lazy" />
                            ) : (
                              <div className="product-thumb" aria-hidden="true">
                                {p.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            {p.originalPrice && <span className="product-promo">Promo</span>}
                          </div>
                          <div className="product-body">
                            {p.category && <span className="badge">{p.category.name}</span>}
                            <div className="product-name">{p.name}</div>
                            <div className="product-price">
                              {formatXOF(p.price)}
                              {p.originalPrice && <span className="was">{formatXOF(p.originalPrice)}</span>}
                            </div>
                            <div className="product-meta">
                              {available > 0 ? (
                                <span className="badge badge-success">{available} en stock</span>
                              ) : (
                                <span className="badge badge-danger">Rupture de stock</span>
                              )}
                              {p.variants.length > 1 && <span className="badge">{p.variants.length} variantes</span>}
                            </div>
                            <ProductDownloadButton
                              product={{
                                name: p.name,
                                description: p.description,
                                category: p.category?.name ?? null,
                                price: p.price,
                                originalPrice: p.originalPrice,
                                shopName: data.shop.name,
                                shopCity: data.shop.city,
                                shopRegion: data.shop.region,
                                shopPhone: data.shop.phone,
                                available,
                                variants: p.variants,
                              }}
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
