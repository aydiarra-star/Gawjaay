import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF } from '../lib/format';
import { Alert, Chips, EmptyState, SearchField, SkeletonGrid } from '../components/ui';
import { IconHeart, IconMapPin, IconMarket, IconStore, IconTag } from '../components/icons';
import { PublicProductImage } from '../components/product';
import { ProductDownloadButton, TerangaBanner } from '../components/premium';

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
  hasImage?: boolean;
  category: { id: string; name: string } | null;
  price: number;
  originalPrice: number | null;
  offers: Offer[];
}
interface MarketplaceResponse {
  items: MarketplaceItem[];
  categories: Array<{ id: string; name: string; slug: string }>;
}

const FAV_KEY = 'gawjaay.favorites';

export function MarketplacePage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ search: '', categoryId: '' });
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (raw) setFavorites(JSON.parse(raw) as string[]);
    } catch {
      /* préférence locale uniquement */
    }
  }, []);

  function toggleFav(id: string) {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const { data, loading, error, reload } = useApi<MarketplaceResponse>(
    () => {
      const params = new URLSearchParams();
      if (query.search) params.set('search', query.search);
      if (query.categoryId) params.set('categoryId', query.categoryId);
      const qs = params.toString();
      return api.get<MarketplaceResponse>(`/public/marketplace${qs ? `?${qs}` : ''}`, { publicRoute: true });
    },
    [query.search, query.categoryId],
  );

  const categories = data?.categories ?? [];

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" style={{ textDecoration: 'none' }}>
          <span className="brand-mark">G</span>
          Gaw<span>Jaay</span>
        </Link>
        <div className="topbar-spacer" />
        <div className="row" style={{ gap: 8 }}>
          <Link to="/login" className="btn btn-secondary btn-sm">
            Connexion
          </Link>
          <Link to="/register" className="btn btn-sm">
            Vendre
          </Link>
        </div>
      </header>

      <main className="main">
        <div className="main-inner">
          <div className="page-head">
            <div>
              <h1>Marketplace</h1>
              <p>Produits réellement disponibles en stock dans les boutiques GawJaay.</p>
            </div>
            <span className="badge badge-primary">
              <IconMarket size={13} />
              Découverte
            </span>
          </div>

          <TerangaBanner
            title="Teranga Week — l'hospitalité sénégalaise, en ligne"
            body="Des produits réellement en stock dans les boutiques GawJaay, au plus près de chez vous. Chaque offre affichée correspond à un stock vérifié côté serveur."
            action={
              <Link to="/register" className="btn btn-lg">
                Ouvrir ma boutique
              </Link>
            }
          />

          <div className="card" style={{ padding: '18px 20px' }}>
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Rechercher un produit…"
              label="Rechercher un produit"
              onSubmit={() => setQuery({ search, categoryId: query.categoryId })}
            />
            <div style={{ marginTop: 16 }}>
              <Chips
                allLabel="Toutes les catégories"
                value={query.categoryId}
                onChange={(categoryId) => setQuery({ search: query.search, categoryId })}
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
              />
              {categories.length === 0 && (
                <p className="small muted" style={{ marginTop: 10 }}>
                  <IconTag size={13} /> Aucune catégorie publiée pour le moment — les catégories apparaîtront ici dès
                  qu'une boutique publiera des produits.
                </p>
              )}
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            {loading && <SkeletonGrid count={8} />}
            {error && (
              <div className="card">
                <Alert kind="error">{error}</Alert>
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={reload}>
                  Réessayer
                </button>
              </div>
            )}

            {!loading && !error && (data?.items.length ?? 0) === 0 && (
              <div className="card">
                <EmptyState
                  title="Aucun produit disponible"
                  hint="Aucun produit n'est actuellement en stock dans une boutique publique. Essayez une autre recherche ou revenez plus tard."
                  icon={<IconMarket size={22} />}
                />
              </div>
            )}

            {!loading && !error && (data?.items.length ?? 0) > 0 && (
              <>
                <div className="section-head" style={{ marginBottom: 16 }}>
                  <div>
                    <div className="section-title">{data!.items.length} produit{data!.items.length > 1 ? 's' : ''}</div>
                    <div className="section-sub">
                      {query.search || query.categoryId ? 'Résultats filtrés' : 'Disponibles maintenant'}
                    </div>
                  </div>
                </div>

                <div className="product-grid">
                  {data!.items.map((item) => {
                    const isFav = favorites.includes(item.id);
                    const offer = item.offers[0];
                    const totalAvailable = item.offers.reduce((s, o) => s + o.available, 0);
                    return (
                      <article className="product-card" key={item.id}>
                        <div className="product-media">
                          <PublicProductImage productId={item.id} name={item.name} hasImage={item.hasImage} imageUrl={item.imageUrl} />
                          {item.originalPrice && <span className="product-promo">Promo</span>}
                          <button
                            type="button"
                            className={`product-fav${isFav ? ' on' : ''}`}
                            aria-label={isFav ? `Retirer ${item.name} des favoris` : `Ajouter ${item.name} aux favoris`}
                            aria-pressed={isFav}
                            onClick={() => toggleFav(item.id)}
                          >
                            <IconHeart size={17} style={isFav ? { fill: 'currentColor' } : undefined} />
                          </button>
                        </div>
                        <div className="product-body">
                          {item.category && <span className="badge">{item.category.name}</span>}
                          <div className="product-name">{item.name}</div>
                          <div className="product-price">
                            {formatXOF(item.price)}
                            {item.originalPrice && <span className="was">{formatXOF(item.originalPrice)}</span>}
                          </div>
                          {offer && (
                            <div className="product-meta">
                              <IconStore size={14} />
                              <Link to={`/shop/${offer.storeSlug}`}>{offer.storeName}</Link>
                              {offer.city && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <IconMapPin size={13} />
                                  {offer.city}
                                </>
                              )}
                            </div>
                          )}
                          <div className="product-meta">
                            {totalAvailable > 0 ? (
                              <span className="badge badge-success">{totalAvailable} en stock</span>
                            ) : (
                              <span className="badge badge-danger">Rupture</span>
                            )}
                            {item.offers.length > 1 && <span className="badge">{item.offers.length} boutiques</span>}
                          </div>
                          <ProductDownloadButton
                            product={{
                              name: item.name,
                              description: item.description,
                              category: item.category?.name ?? null,
                              price: item.price,
                              originalPrice: item.originalPrice,
                              shopName: offer?.storeName ?? null,
                              shopCity: offer?.city ?? null,
                              shopRegion: offer?.region ?? null,
                              available: totalAvailable,
                            }}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
