import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF } from '../lib/format';
import { PACKAGING_LABELS, isPackagingType } from '@gawjaay/shared';
import { Alert, Card, EmptyState, SkeletonGrid } from '../components/ui';
import { BuyerShell } from '../components/BuyerHeader';
import { PublicProductImage, ImageLightbox, publicProductImageSrc } from '../components/product';
import { IconMapPin, IconPackage, IconStore } from '../components/icons';
import { useCart } from '../context/CartContext';
import { storeWhatsappLink } from '../lib/whatsapp';

interface Offer {
  storeId: string;
  storeName: string;
  storeSlug: string;
  city: string | null;
  region: string | null;
  storePhone: string | null;
  storeWhatsapp: string | null;
  variantId: string;
  variantName: string;
  variantPrice: number | null;
  available: number | null;
  price: number;
  distanceKm: number | null;
}
type OfferSortMode = 'price' | 'distance' | 'availability';

interface PublicProduct {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  hasImage: boolean;
  packaging: string;
  format: string | null;
  category: { id: string; name: string } | null;
  price: number;
  originalPrice: number | null;
  available: number | null;
  minDistanceKm: number | null;
  variants: Array<{ id: string; name: string; price: number; basePrice: number; promoPrice: number | null; available: number }>;
  offers: Offer[];
}

/** Construit un message WhatsApp factuel (le contact ouvre WhatsApp, ne crée AUCUNE commande GawJaay). */
function whatsappLink(offer: Offer, productName: string, quantity: number) {
  return storeWhatsappLink({
    storeWhatsapp: offer.storeWhatsapp,
    storePhone: offer.storePhone,
    storeName: offer.storeName,
    productName,
    variantName: offer.variantName,
    quantity,
  });
}

export function ProductDetailPage() {
  const { id = '' } = useParams();
  const cart = useCart();
  const { data, loading, error } = useApi<{ product: PublicProduct }>(
    () => api.get(`/public/products/${encodeURIComponent(id)}`, { publicRoute: true }),
    [id],
  );

  const product = data?.product;
  const [offerKey, setOfferKey] = useState<string | null>(null);
  const [offerSort, setOfferSort] = useState<OfferSortMode>('price');
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [conflict, setConflict] = useState<{ item: (typeof cart.items)[number]; currentStoreName: string } | null>(null);

  const productImageSrc = product ? publicProductImageSrc({ productId: product.id, hasImage: product.hasImage, imageUrl: product.imageUrl }) : null;

  const selectedOffer = useMemo(() => {
    if (!product) return null;
    const offers = product.offers;
    return offers.find((o) => `${o.storeId}:${o.variantId}` === offerKey) ?? offers[0] ?? null;
  }, [product, offerKey]);

  const comparisonOffers = useMemo(() => {
    if (!product) return [];
    return [...product.offers].sort((a, b) => {
      if (offerSort === 'price') {
        return a.price - b.price || a.storeName.localeCompare(b.storeName) || a.variantName.localeCompare(b.variantName);
      }
      if (offerSort === 'distance') {
        const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
        const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
        return da - db || a.price - b.price || a.storeName.localeCompare(b.storeName);
      }
      const da = a.available ?? Number.POSITIVE_INFINITY;
      const db = b.available ?? Number.POSITIVE_INFINITY;
      return db - da || a.price - b.price || a.storeName.localeCompare(b.storeName);
    });
  }, [product, offerSort]);

  const packLabel = product && isPackagingType(product.packaging) ? PACKAGING_LABELS[product.packaging].plural : 'unités';

  // Disponibilité honnête : 0 = rupture réelle, null = inconnue/non calculable
  // (jamais transformée en « 0 en stock » ni en quantité inventée).
  const productUnknown = product?.available == null;
  const offerUnknown = selectedOffer?.available == null;
  const offerSoldOut = selectedOffer != null && selectedOffer.available !== null && selectedOffer.available <= 0;
  const offerPurchasable = selectedOffer != null && (selectedOffer.available === null || selectedOffer.available > 0);
  const quantityMax = selectedOffer?.available != null && selectedOffer.available > 0 ? selectedOffer.available : 1;

  function buildCartItem() {
    if (!product || !selectedOffer) return null;
    return {
      productId: product.id,
      variantId: selectedOffer.variantId,
      name: product.name,
      variantName: selectedOffer.variantName,
      hasImage: product.hasImage,
      imageUrl: product.imageUrl,
      unitPrice: selectedOffer.price,
      storeId: selectedOffer.storeId,
      storeName: selectedOffer.storeName,
      storeSlug: selectedOffer.storeSlug,
      city: selectedOffer.city,
      region: selectedOffer.region,
      quantity,
      available: selectedOffer.available,
    };
  }

  function addToCart() {
    setNotice(null);
    const item = buildCartItem();
    if (!item) return;
    const result = cart.add(item);
    if (!result.ok) {
      setConflict({ item, currentStoreName: result.currentStoreName });
      return;
    }
    setNotice('Article ajouté au panier.');
  }

  return (
    <BuyerShell>
      {loading && <SkeletonGrid count={4} />}
      {error && (
        <div className="card">
          <Alert kind="error">{error}</Alert>
          <Link to="/marketplace" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}>
            Retour à la marketplace
          </Link>
        </div>
      )}
      {!loading && !error && !product && (
        <div className="card">
          <EmptyState title="Produit introuvable" hint="Ce produit n'est plus disponible publiquement." icon={<IconPackage size={22} />} />
        </div>
      )}

      {product && (
        <>
          <div className="product-detail">
            <div className="product-detail-media">
              {productImageSrc ? (
                <button
                  type="button"
                  className="product-detail-image-btn"
                  onClick={() => setLightboxOpen(true)}
                  aria-label={`Agrandir la photo de ${product.name}`}
                >
                  <PublicProductImage productId={product.id} name={product.name} hasImage={product.hasImage} imageUrl={product.imageUrl} />
                  <span className="product-detail-zoomhint" aria-hidden="true">
                    Voir en grand
                  </span>
                </button>
              ) : (
                <PublicProductImage productId={product.id} name={product.name} hasImage={product.hasImage} imageUrl={product.imageUrl} />
              )}
              {product.originalPrice && <span className="product-promo">Promo</span>}
            </div>
            <div className="product-detail-body">
              {product.category && <span className="badge">{product.category.name}</span>}
              <h1>{product.name}</h1>
              <div className="product-price" style={{ fontSize: '1.8rem' }}>
                {formatXOF(selectedOffer?.price ?? product.price)}
                {product.originalPrice && <span className="was">{formatXOF(product.originalPrice)}</span>}
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {productUnknown ? (
                  <span className="badge badge-info">Disponibilité à confirmer</span>
                ) : product.available! > 0 ? (
                  <span className="badge badge-success">{product.available} en stock</span>
                ) : (
                  <span className="badge badge-danger">Rupture de stock</span>
                )}
                {product.format && <span className="badge">{product.format}</span>}
                <span className="badge">{product.offers.length} boutique{product.offers.length > 1 ? 's' : ''}</span>
              </div>
              {product.description && <p className="muted">{product.description}</p>}

              {/* Comparateur factuel : aucun score, aucune recommandation, aucun « meilleur vendeur ». */}
              <Card
                title="Comparer les offres"
                action={
                  product.offers.length > 1 ? (
                    <label className="offer-compare-sort">
                      <span className="small muted">Trier par</span>
                      <select
                        value={offerSort}
                        onChange={(e) => setOfferSort(e.target.value as OfferSortMode)}
                        aria-label="Trier les offres"
                      >
                        <option value="price">Prix</option>
                        <option value="distance">Distance</option>
                        <option value="availability">Disponibilité</option>
                      </select>
                    </label>
                  ) : undefined
                }
              >
                <p className="offer-compare-note">
                  Informations factuelles uniquement. GawJaay ne désigne pas de meilleure offre.
                </p>
                <div className="stack">
                  {comparisonOffers.map((o) => {
                    const key = `${o.storeId}:${o.variantId}`;
                    const active = selectedOffer && `${selectedOffer.storeId}:${selectedOffer.variantId}` === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`offer-row${active ? ' on' : ''}`}
                        onClick={() => {
                          setOfferKey(key);
                          setQuantity(1);
                        }}
                        aria-pressed={Boolean(active)}
                      >
                        <span className="offer-main">
                          <IconStore size={15} />
                          <span>
                            <strong>{o.storeName}</strong>
                            <span className="small muted" style={{ display: 'block' }}>
                              {[o.city, o.region].filter(Boolean).join(', ') || 'Localisation non renseignée'}
                              {' · variante '}{o.variantName}
                            </span>
                          </span>
                        </span>
                        <span className="offer-side">
                          <strong>{formatXOF(o.price)}</strong>
                          <span className="small muted">
                            {o.available === null ? 'Disponibilité à confirmer' : `${o.available} en stock`}
                            {o.distanceKm != null && (
                              <>
                                {' '}
                                · <IconMapPin size={11} /> {o.distanceKm} km
                              </>
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>

              {selectedOffer && (
                <div className="row" style={{ gap: 12, alignItems: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
                  <div className="field" style={{ margin: 0, maxWidth: 160 }}>
                    <label htmlFor="qty">Quantité ({packLabel})</label>
                    <input
                      id="qty"
                      type="number"
                      min={1}
                      max={quantityMax}
                      value={quantity}
                      disabled={!offerPurchasable}
                      onChange={(e) => setQuantity(Math.max(1, Math.min(Number(e.target.value) || 1, quantityMax)))}
                    />
                  </div>
                  <button className="btn btn-lg" onClick={addToCart} disabled={!offerPurchasable}>
                    {offerSoldOut ? 'Indisponible' : 'Ajouter au panier'}
                  </button>
                  {(selectedOffer.storeWhatsapp || selectedOffer.storePhone) && (
                    <a
                      className="btn btn-secondary btn-lg"
                      href={whatsappLink(selectedOffer, product.name, quantity) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Commander via WhatsApp
                    </a>
                  )}
                </div>
              )}
              {offerUnknown && (
                <p className="field-hint" style={{ marginTop: 8 }} role="status">
                  La disponibilité exacte n’est pas confirmée par cette boutique. Vous pouvez commander : le vendeur
                  validera la disponibilité avant préparation.
                </p>
              )}
              {offerSoldOut && (
                <p className="field-hint" style={{ marginTop: 8 }} role="status">
                  Cet article n’est plus disponible dans cette boutique. Choisissez une autre boutique ou revenez plus tard.
                </p>
              )}

              <p className="field-hint" style={{ marginTop: 10 }}>
                Retrait en boutique. Le paiement se fait directement auprès du vendeur (espèces ou mobile money) :
                aucun paiement en ligne n'est disponible pour le moment.
              </p>
              {notice && <Alert kind="success">{notice}</Alert>}
              <div className="row" style={{ gap: 10, marginTop: 8 }}>
                <Link to="/cart" className="btn btn-secondary btn-sm">
                  Voir le panier
                </Link>
              </div>
            </div>
          </div>

          {conflict && (
            <div className="card" style={{ borderColor: 'var(--warn, #b45309)' }}>
              <Alert kind="warning">
                Ce produit vient d'une autre boutique ({conflict.currentStoreName}). Vider le panier actuel pour continuer ?
              </Alert>
              <div className="row" style={{ gap: 10 }}>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    cart.replaceWith(conflict.item);
                    setConflict(null);
                    setNotice('Panier remplacé par ce produit.');
                  }}
                >
                  Vider et ajouter
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setConflict(null)}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {lightboxOpen && productImageSrc && (
            <ImageLightbox
              images={[{ src: productImageSrc, alt: product.name }]}
              index={0}
              onIndexChange={() => undefined}
              onClose={() => setLightboxOpen(false)}
              title={product.name}
            />
          )}
        </>
      )}
    </BuyerShell>
  );
}
