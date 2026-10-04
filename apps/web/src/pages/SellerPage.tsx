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

interface SellerResponse {
  seller: PublicSeller;
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

              <div style={{ marginTop: 20 }}>
                <Link to={`/marketplace`} className="btn btn-secondary btn-sm">
                  Voir les produits disponibles
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
