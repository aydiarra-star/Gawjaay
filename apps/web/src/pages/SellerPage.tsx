import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { SELLER_TYPE_LABELS, type SellerType } from '@gawjaay/shared';
import { Alert, Avatar, EmptyState, SkeletonGrid } from '../components/ui';
import { IconMapPin, IconStore } from '../components/icons';

interface PublicSeller {
  id: string;
  displayName: string;
  sellerType: string;
  bio: string | null;
  city: string | null;
  region: string | null;
  activeListings: number;
}

interface PublicSellerListing {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  quantity: number | null;
  condition: string | null;
  fulfillment: string;
  city: string | null;
  region: string | null;
  imageUrl: string | null;
}

interface SellerResponse {
  seller: PublicSeller & { listings: PublicSellerListing[] };
}

/**
 * Fiche vendeur publique. N'affiche que des informations réellement publiques.
 * Aucun badge « vérifié » : aucune vérification officielle n'existe.
 */
export function SellerPage() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useApi<SellerResponse>(
    () => api.get<SellerResponse>(`/public/sellers/${encodeURIComponent(id)}`, { publicRoute: true }),
    [id],
  );

  const seller = data?.seller;
  const location = [seller?.city, seller?.region].filter(Boolean).join(', ');

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
          {loading && <SkeletonGrid count={4} />}

          {error && (
            <div className="card">
              <Alert kind="error">{error}</Alert>
              <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={reload}>
                Réessayer
              </button>
            </div>
          )}

          {!loading && !error && !seller && (
            <div className="card">
              <EmptyState title="Vendeur introuvable" hint="Ce profil n'est pas disponible publiquement." icon={<IconStore size={22} />} />
            </div>
          )}

          {!loading && !error && seller && (
            <>
              <div className="card" style={{ padding: '22px 24px' }}>
                <div className="row" style={{ gap: 14, alignItems: 'center' }}>
                  <Avatar name={seller.displayName} size={52} />
                  <div>
                    <h1 style={{ margin: 0 }}>{seller.displayName}</h1>
                    <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <span className="badge badge-primary">
                        {SELLER_TYPE_LABELS[seller.sellerType as SellerType] ?? seller.sellerType}
                      </span>
                      {location && (
                        <span className="badge">
                          <IconMapPin size={12} /> {location}
                        </span>
                      )}
                      <span className="badge">
                        {seller.activeListings} annonce{seller.activeListings > 1 ? 's' : ''} active{seller.activeListings > 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
                {seller.bio && (
                  <p className="muted" style={{ marginTop: 16 }}>
                    {seller.bio}
                  </p>
                )}
              </div>

              <section style={{ marginTop: 20 }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div>
                    <h2 style={{ margin: 0 }}>Annonces du vendeur</h2>
                    <p className="muted small" style={{ margin: '4px 0 0' }}>
                      Informations déclarées par le vendeur. Aucun classement ni avis artificiel.
                    </p>
                  </div>
                  <Link to="/marketplace" className="btn btn-secondary btn-sm">Marketplace</Link>
                </div>
                {seller.listings.length === 0 ? (
                  <div className="card">
                    <EmptyState title="Aucune annonce active" hint="Ce vendeur n'a pas actuellement d'annonce publique." icon={<IconStore size={22} />} />
                  </div>
                ) : (
                  <div className="grid-3">
                    {seller.listings.map((listing) => (
                      <article className="card" key={listing.id}>
                        {listing.imageUrl && (
                          <img src={listing.imageUrl} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 12 }} />
                        )}
                        <div style={{ marginTop: listing.imageUrl ? 12 : 0 }}>
                          <h3 style={{ margin: 0 }}>{listing.title}</h3>
                          {listing.description && <p className="muted small">{listing.description}</p>}
                          <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                            {listing.price != null && <span className="badge badge-primary">{listing.price.toLocaleString('fr-FR')} FCFA</span>}
                            {listing.condition && <span className="badge">{listing.condition === 'USED' ? 'Occasion' : 'Neuf'}</span>}
                            <span className="badge">{listing.fulfillment === 'BOTH' ? 'Retrait ou livraison' : listing.fulfillment === 'DELIVERY' ? 'Livraison' : 'Retrait'}</span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
