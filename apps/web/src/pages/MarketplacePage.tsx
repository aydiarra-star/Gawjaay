import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF } from '../lib/format';
import { DISCOVERY_RADII_KM, LISTING_CONDITION_LABELS, FULFILLMENT_LABELS } from '@gawjaay/shared';
import { Alert, CategoryBar, Chips, EmptyState, SearchField, SkeletonGrid } from '../components/ui';
import { IconHeart, IconMapPin, IconMarket, IconStore, IconTag } from '../components/icons';
import { PublicProductImage } from '../components/product';
import { ProductDownloadButton, TerangaBanner } from '../components/premium';
import { BuyerHeader } from '../components/BuyerHeader';
import { useCart } from '../context/CartContext';
import { storeWhatsappLink } from '../lib/whatsapp';

interface Offer {
  storeId: string;
  storeName: string;
  storeSlug: string;
  city: string | null;
  region: string | null;
  storePhone?: string | null;
  storeWhatsapp?: string | null;
  variantId: string;
  variantName: string;
  variantPrice?: number | null;
  available: number;
  distanceKm: number | null;
  price?: number;
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
  available: number;
  offers: Offer[];
  minDistanceKm: number | null;
}
interface MarketplaceResponse {
  items: MarketplaceItem[];
  total: number;
  page: number;
  pageSize: number;
  categories: Array<{ id: string; name: string; slug: string }>;
  regions: string[];
  cities: string[];
  proximityApplied: boolean;
}
interface PublicListing {
  id: string;
  title: string;
  description: string | null;
  condition: string | null;
  fulfillment: string;
  city: string | null;
  region: string | null;
  price: number | null;
  available: number | null;
  seller: { id: string; displayName: string; sellerType: string; city: string | null; region: string | null };
  product: { id: string; name: string } | null;
  store: { id: string; name: string; slug: string } | null;
  distanceKm: number | null;
}
interface ListingsResponse {
  items: PublicListing[];
  total: number;
  page: number;
  pageSize: number;
}

const FAV_KEY = 'gawjaay.favorites';
const PAGE_SIZE = 20;

/** Filtres partagés par les onglets produits et annonces. */
interface Filters {
  search: string;
  categoryId: string;
  region: string;
  city: string;
  priceMin: string;
  priceMax: string;
  sellerType: string;
  fulfillment: string;
  radiusKm: string;
}

const EMPTY_FILTERS: Filters = {
  search: '',
  categoryId: '',
  region: '',
  city: '',
  priceMin: '',
  priceMax: '',
  sellerType: '',
  fulfillment: '',
  radiusKm: '',
};

export function MarketplacePage() {
  const [tab, setTab] = useState<'products' | 'listings'>('products');
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const cart = useCart();
  const [cartNotice, setCartNotice] = useState<string | null>(null);

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

  function apply() {
    setApplied({ ...draft });
    setPage(1);
  }

  function reset() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  /** Proximité : la position est utilisée localement pour la requête, jamais stockée. */
  function locate() {
    if (!navigator.geolocation) {
      setGeoNote("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoNote('Position utilisée uniquement pour trier par distance. Elle n’est ni enregistrée ni affichée.');
        setPage(1);
      },
      () => setGeoNote('Position refusée. Vous pouvez chercher par région et ville.'),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  function clearLocation() {
    setCoords(null);
    setGeoNote(null);
    setPage(1);
  }

  const params = useMemo(() => {
    const p = new URLSearchParams();
    const src = applied;
    if (src.search) p.set('search', src.search);
    if (src.categoryId) p.set('categoryId', src.categoryId);
    if (src.region) p.set('region', src.region);
    if (src.city) p.set('city', src.city);
    if (src.priceMin) p.set('priceMin', src.priceMin);
    if (src.priceMax) p.set('priceMax', src.priceMax);
    if (src.sellerType) p.set('sellerType', src.sellerType);
    if (src.fulfillment) p.set('fulfillment', src.fulfillment);
    if (coords && src.radiusKm) {
      p.set('lat', String(coords.lat));
      p.set('lng', String(coords.lng));
      p.set('radiusKm', src.radiusKm);
    }
    p.set('page', String(page));
    p.set('pageSize', String(PAGE_SIZE));
    return p.toString();
  }, [applied, coords, page]);

  const { data, loading, error, reload } = useApi<MarketplaceResponse>(
    () => api.get<MarketplaceResponse>(`/public/marketplace?${params}`, { publicRoute: true }),
    [params],
  );

  const { data: listingsData, loading: listingsLoading, error: listingsError } = useApi<ListingsResponse>(
    () =>
      api.get<ListingsResponse>(
        `/public/listings?${(() => {
          const p = new URLSearchParams();
          if (applied.search) p.set('search', applied.search);
          if (applied.region) p.set('region', applied.region);
          if (applied.city) p.set('city', applied.city);
          if (applied.priceMin) p.set('priceMin', applied.priceMin);
          if (applied.priceMax) p.set('priceMax', applied.priceMax);
          if (applied.sellerType) p.set('sellerType', applied.sellerType);
          if (applied.fulfillment) p.set('fulfillment', applied.fulfillment);
          if (coords && applied.radiusKm) {
            p.set('lat', String(coords.lat));
            p.set('lng', String(coords.lng));
            p.set('radiusKm', applied.radiusKm);
          }
          p.set('page', String(page));
          p.set('pageSize', String(PAGE_SIZE));
          return p.toString();
        })()}`,
        { publicRoute: true },
      ),
    [applied, coords, page],
  );

  const categories = data?.categories ?? [];
  const regions = data?.regions ?? [];
  const cities = data?.cities ?? [];
  const total = tab === 'products' ? data?.total ?? 0 : listingsData?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Object.values(applied).some(Boolean) || Boolean(coords);

  return (
    <div className="app-shell">
      <BuyerHeader />

      <main className="main">
        <div className="main-inner">
          <div className="page-head">
            <div>
              <h1>Marketplace</h1>
              <p>Produits et annonces réellement disponibles chez des vendeurs GawJaay.</p>
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
              value={draft.search}
              onChange={(search) => setDraft({ ...draft, search })}
              placeholder="Rechercher un produit, un vendeur…"
              label="Rechercher"
              onSubmit={apply}
            />

            <div style={{ marginTop: 12 }}>
              <Chips
                allLabel="Tous"
                value={tab}
                onChange={(v) => {
                  setTab((v || 'products') as 'products' | 'listings');
                  setPage(1);
                }}
                options={[
                  { value: 'products' as const, label: 'Produits' },
                  { value: 'listings' as const, label: 'Annonces' },
                ]}
              />
            </div>

            <div className="form-row" style={{ marginTop: 16 }}>
              <div className="field">
                <label htmlFor="m-region">Région</label>
                <select id="m-region" value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })}>
                  <option value="">Toutes les régions</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="m-city">Ville</label>
                <select id="m-city" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })}>
                  <option value="">Toutes les villes</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label htmlFor="m-min">Prix minimum (FCFA)</label>
                <input id="m-min" type="number" min={0} inputMode="numeric" value={draft.priceMin} onChange={(e) => setDraft({ ...draft, priceMin: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="m-max">Prix maximum (FCFA)</label>
                <input id="m-max" type="number" min={0} inputMode="numeric" value={draft.priceMax} onChange={(e) => setDraft({ ...draft, priceMax: e.target.value })} />
              </div>
            </div>

            <div className="form-row">
              <div className="field">
                <label htmlFor="m-seller">Type de vendeur</label>
                <select id="m-seller" value={draft.sellerType} onChange={(e) => setDraft({ ...draft, sellerType: e.target.value })}>
                  <option value="">Tous les vendeurs</option>
                  <option value="INDIVIDUAL">Particulier</option>
                  <option value="MERCHANT">Commerçant</option>
                  <option value="BUSINESS">Entreprise</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="m-radius">Rayon de proximité</label>
                <select id="m-radius" value={draft.radiusKm} onChange={(e) => setDraft({ ...draft, radiusKm: e.target.value })} disabled={!coords}>
                  <option value="">Aucun rayon</option>
                  {DISCOVERY_RADII_KM.map((r) => (
                    <option key={r} value={String(r)}>
                      {r} km
                    </option>
                  ))}
                </select>
                <p className="field-hint">
                  {coords ? 'Rayon appliqué autour de votre position.' : 'Activez « Autour de moi » pour utiliser un rayon.'}
                </p>
              </div>
            </div>

            {tab === 'products' && (
              <div style={{ marginTop: 12 }}>
                <CategoryBar
                  categories={categories}
                  value={applied.categoryId}
                  onChange={(categoryId) => {
                    setDraft((d) => ({ ...d, categoryId }));
                    setApplied((a) => ({ ...a, categoryId }));
                    setPage(1);
                  }}
                />
              </div>
            )}

            <div className="row" style={{ gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-sm" onClick={apply}>
                Appliquer les filtres
              </button>
              {coords ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearLocation}>
                  <IconMapPin size={14} /> Position activée — désactiver
                </button>
              ) : (
                <button type="button" className="btn btn-secondary btn-sm" onClick={locate}>
                  <IconMapPin size={14} /> Autour de moi
                </button>
              )}
              {hasFilters && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>
                  Réinitialiser
                </button>
              )}
            </div>
            {geoNote && (
              <p className="field-hint" style={{ marginTop: 10 }}>
                {geoNote}
              </p>
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            {cartNotice && (
              <div style={{ marginBottom: 14 }}>
                <Alert kind="info">{cartNotice}</Alert>
              </div>
            )}
            {(loading || listingsLoading) && <SkeletonGrid count={8} />}
            {error && tab === 'products' && (
              <div className="card">
                <Alert kind="error">{error}</Alert>
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={reload}>
                  Réessayer
                </button>
              </div>
            )}
            {listingsError && tab === 'listings' && (
              <div className="card">
                <Alert kind="error">{listingsError}</Alert>
              </div>
            )}

            {!loading && !error && tab === 'products' && (data?.items.length ?? 0) === 0 && (
              <div className="card">
                <EmptyState
                  title="Aucun produit disponible"
                  hint="Aucun produit ne correspond à cette recherche. Essayez d'élargir les filtres ou revenez plus tard."
                  icon={<IconMarket size={22} />}
                />
              </div>
            )}

            {!listingsLoading && !listingsError && tab === 'listings' && (listingsData?.items.length ?? 0) === 0 && (
              <div className="card">
                <EmptyState
                  title="Aucune annonce disponible"
                  hint="Aucune annonce active ne correspond à cette recherche pour le moment."
                  icon={<IconTag size={22} />}
                />
              </div>
            )}

            {!loading && !error && tab === 'products' && (data?.items.length ?? 0) > 0 && (
              <>
                <div className="section-head" style={{ marginBottom: 16 }}>
                  <div>
                    <div className="section-title">
                      {total} produit{total > 1 ? 's' : ''}
                    </div>
                    <div className="section-sub">{hasFilters ? 'Résultats filtrés' : 'Disponibles maintenant'}</div>
                  </div>
                </div>

                <div className="product-grid">
                  {data!.items.map((item) => {
                    const isFav = favorites.includes(item.id);
                    const offer = item.offers[0];
                    return (
                      <article className="product-card" key={item.id}>
                        <div className="product-media">
                          <Link to={`/product/${item.id}`} aria-label={`Voir ${item.name}`}>
                            <PublicProductImage productId={item.id} name={item.name} hasImage={item.hasImage} imageUrl={item.imageUrl} />
                          </Link>
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
                          <Link to={`/product/${item.id}`} className="product-name product-link">
                            {item.name}
                          </Link>
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
                            {item.available > 0 ? (
                              <span className="badge badge-success">{item.available} en stock</span>
                            ) : (
                              <span className="badge badge-danger">Rupture</span>
                            )}
                            {item.offers.length > 1 && <span className="badge">{item.offers.length} boutiques</span>}
                            {item.minDistanceKm != null && (
                              <span className="badge badge-info">
                                <IconMapPin size={12} /> {item.minDistanceKm} km
                              </span>
                            )}
                          </div>
                          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                            {item.available > 0 ? (
                              <button
                                type="button"
                                className="btn btn-lg product-cta-primary"
                                onClick={() => {
                                  setCartNotice(null);
                                  const result = cart.add({
                                    productId: item.id,
                                    variantId: offer.variantId,
                                    name: item.name,
                                    variantName: offer.variantName,
                                    hasImage: Boolean(item.hasImage),
                                    imageUrl: item.imageUrl,
                                    unitPrice: offer.price ?? item.price,
                                    storeId: offer.storeId,
                                    storeName: offer.storeName,
                                    storeSlug: offer.storeSlug,
                                    city: offer.city,
                                    region: offer.region,
                                    quantity: 1,
                                    available: offer.available,
                                  });
                                  setCartNotice(
                                    result.ok
                                      ? 'Ajouté au panier.'
                                      : `Ce produit vient d'une autre boutique (${result.currentStoreName}). Ouvrez la fiche produit pour remplacer le panier.`,
                                  );
                                }}
                              >
                                Ajouter au panier
                              </button>
                            ) : (
                              <button type="button" className="btn btn-lg" disabled>
                                Indisponible
                              </button>
                            )}
                            <Link to={`/product/${item.id}`} className="btn btn-secondary btn-sm">
                              Voir la fiche
                            </Link>
                            {(() => {
                              const wa = storeWhatsappLink({
                                storeWhatsapp: offer.storeWhatsapp,
                                storePhone: offer.storePhone,
                                storeName: offer.storeName,
                                productName: item.name,
                                variantName: offer.variantName,
                              });
                              if (!wa) return null;
                              return (
                                <a className="btn btn-ghost btn-sm" href={wa} target="_blank" rel="noopener noreferrer">
                                  WhatsApp
                                </a>
                              );
                            })()}
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
                              available: item.available,
                            }}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}

            {!listingsLoading && !listingsError && tab === 'listings' && (listingsData?.items.length ?? 0) > 0 && (
              <>
                <div className="section-head" style={{ marginBottom: 16 }}>
                  <div>
                    <div className="section-title">
                      {total} annonce{total > 1 ? 's' : ''}
                    </div>
                    <div className="section-sub">{hasFilters ? 'Résultats filtrés' : 'Publiées maintenant'}</div>
                  </div>
                </div>
                <div className="product-grid">
                  {listingsData!.items.map((l) => (
                    <article className="product-card" key={l.id}>
                      <div className="product-body">
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                          {l.condition && <span className="badge">{LISTING_CONDITION_LABELS[l.condition as keyof typeof LISTING_CONDITION_LABELS] ?? l.condition}</span>}
                          <span className="badge badge-info">{FULFILLMENT_LABELS[l.fulfillment as keyof typeof FULFILLMENT_LABELS] ?? l.fulfillment}</span>
                        </div>
                        <div className="product-name">{l.title}</div>
                        {l.price != null && <div className="product-price">{formatXOF(l.price)}</div>}
                        {l.description && <p className="small muted">{l.description}</p>}
                        <div className="product-meta">
                          <IconStore size={14} />
                          <Link to={`/seller/${l.seller.id}`}>{l.seller.displayName}</Link>
                          {l.city && (
                            <>
                              <span aria-hidden="true">·</span>
                              <IconMapPin size={13} />
                              {l.city}
                            </>
                          )}
                        </div>
                        <div className="product-meta">
                          {l.available != null && l.available > 0 ? (
                            <span className="badge badge-success">{l.available} disponible{l.available > 1 ? 's' : ''}</span>
                          ) : (
                            <span className="badge">Sur demande</span>
                          )}
                          {l.distanceKm != null && (
                            <span className="badge badge-info">
                              <IconMapPin size={12} /> {l.distanceKm} km
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}

            {total > PAGE_SIZE && (
              <div className="row" style={{ justifyContent: 'center', gap: 12, marginTop: 24 }}>
                <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Précédent
                </button>
                <span className="small muted" style={{ alignSelf: 'center' }}>
                  Page {page} / {pageCount}
                </span>
                <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                  Suivant
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
