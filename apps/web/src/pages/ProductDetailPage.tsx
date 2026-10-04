import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF } from '../lib/format';
import { PACKAGING_LABELS, isPackagingType } from '@gawjaay/shared';
import { Alert, Card, EmptyState, SkeletonGrid } from '../components/ui';
import { BuyerShell } from '../components/BuyerHeader';
import { PublicProductImage } from '../components/product';
import { IconMapPin, IconPackage, IconStore } from '../components/icons';
import { useCart } from '../context/CartContext';

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
  available: number;
  price: number;
  distanceKm: number | null;
}
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
  available: number;
  minDistanceKm: number | null;
  variants: Array<{ id: string; name: string; price: number; basePrice: number; promoPrice: number | null; available: number }>;
  offers: Offer[];
}

/** Construit un message WhatsApp factuel (le contact ouvre WhatsApp, ne crée AUCUNE commande GawJaay). */
function whatsappLink(offer: Offer, productName: string, quantity: number) {
  const phone = (offer.storeWhatsapp ?? offer.storePhone ?? '').replace(/[^0-9]/g, '');
  const text = `Bonjour ${offer.storeName}, je suis intéressé(e) par « ${productName} »${offer.variantName ? ` (${offer.variantName})` : ''} — quantité ${quantity}, vu sur GawJaay.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
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
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ item: (typeof cart.items)[number]; currentStoreName: string } | null>(null);

  const selectedOffer = useMemo(() => {
    if (!product) return null;
    const offers = product.offers;
    return offers.find((o) => `${o.storeId}:${o.variantId}` === offerKey) ?? offers[0] ?? null;
  }, [product, offerKey]);

  const packLabel = product && isPackagingType(product.packaging) ? PACKAGING_LABELS[product.packaging].plural : 'unités';

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
              <PublicProductImage productId={product.id} name={product.name} hasImage={product.hasImage} imageUrl={product.imageUrl} />
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
                {product.available > 0 ? (
                  <span className="badge badge-success">{product.available} en stock</span>
                ) : (
                  <span className="badge badge-danger">Rupture de stock</span>
                )}
                {product.format && <span className="badge">{product.format}</span>}
                <span className="badge">{product.offers.length} boutique{product.offers.length > 1 ? 's' : ''}</span>
              </div>
              {product.description && <p className="muted">{product.description}</p>}

              {/* Boutiques / offres réelles — liste factuelle, aucun classement. */}
              <Card title="Boutiques disponibles">
                <div className="stack">
                  {product.offers.map((o) => {
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
                            {o.available} en stock
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
                      max={Math.max(1, selectedOffer.available)}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Math.min(Number(e.target.value) || 1, Math.max(1, selectedOffer.available))))}
                    />
                  </div>
                  <button className="btn btn-lg" onClick={addToCart} disabled={selectedOffer.available <= 0}>
                    Ajouter au panier
                  </button>
                  {(selectedOffer.storeWhatsapp || selectedOffer.storePhone) && (
                    <a
                      className="btn btn-secondary btn-lg"
                      href={whatsappLink(selectedOffer, product.name, quantity)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Commander via WhatsApp
                    </a>
                  )}
                </div>
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
        </>
      )}
    </BuyerShell>
  );
}
