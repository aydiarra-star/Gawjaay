import { Link, useNavigate } from 'react-router-dom';
import { formatXOF } from '../lib/format';
import { EmptyState } from '../components/ui';
import { BuyerShell } from '../components/BuyerHeader';
import { IconCart, IconStore } from '../components/icons';
import { PublicProductImage } from '../components/product';
import { useCart } from '../context/CartContext';

export function CartPage() {
  const cart = useCart();
  const navigate = useNavigate();

  return (
    <BuyerShell>
      <div className="page-head">
        <div>
          <h1>Mon panier</h1>
          <p>Un panier ne contient qu'une seule boutique. Le serveur recalcule prix et stock au moment de commander.</p>
        </div>
      </div>

      {cart.items.length === 0 ? (
        <div className="card">
          <EmptyState
            title="Panier vide"
            hint="Ajoutez des produits depuis la marketplace pour commander."
            icon={<IconCart size={22} />}
            action={
              <Link to="/marketplace" className="btn">
                Explorer la marketplace
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="card">
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <IconStore size={16} />
              <strong>{cart.storeName}</strong>
              {cart.items[0]?.city && <span className="badge">{[cart.items[0].city, cart.items[0].region].filter(Boolean).join(', ')}</span>}
            </div>
          </div>

          <div className="stack" style={{ marginTop: 16 }}>
            {cart.items.map((item) => (
              <div className="card cart-line" key={item.variantId}>
                <div className="cart-line-product">
                  <PublicProductImage productId={item.productId} name={item.name} hasImage={item.hasImage} imageUrl={item.imageUrl} className="cart-item-thumb" />
                  <div className="cart-line-main">
                  <strong>{item.name}</strong>
                  {item.variantName && <span className="small muted"> · {item.variantName}</span>}
                  <div className="small muted">
                    {formatXOF(item.unitPrice)} × {item.quantity} = <strong>{formatXOF(item.unitPrice * item.quantity)}</strong>
                    {item.available != null && item.available < item.quantity && (
                      <span style={{ color: 'var(--danger)' }}> · stock réel : {item.available}</span>
                    )}
                    {item.available == null && <span className="muted"> · disponibilité à confirmer</span>}
                  </div>
                  </div>
                </div>
                <div className="cart-line-actions row" style={{ gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-label={`Diminuer la quantité de ${item.name}`}
                    onClick={() => cart.setQuantity(item.variantId, item.quantity - 1)}
                  >
                    −
                  </button>
                  <input
                    aria-label={`Quantité de ${item.name}`}
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => cart.setQuantity(item.variantId, Number(e.target.value) || 1)}
                    style={{ width: 72 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    aria-label={`Augmenter la quantité de ${item.name}`}
                    onClick={() => cart.setQuantity(item.variantId, item.quantity + 1)}
                  >
                    +
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => cart.remove(item.variantId)}>
                    Retirer
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="row between">
              <span>Total (prix affichés)</span>
              <strong style={{ fontSize: '1.3rem' }}>{formatXOF(cart.subtotal)}</strong>
            </div>
            <p className="field-hint" style={{ marginTop: 6 }}>
              Le prix définitif est recalculé par le serveur à la commande.
            </p>
            <div className="row" style={{ gap: 10, marginTop: 8 }}>
              <button className="btn btn-lg" onClick={() => navigate('/checkout')}>
                Commander
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-lg"
                onClick={() => {
                  cart.clear();
                  navigate('/marketplace');
                }}
              >
                Vider le panier
              </button>
            </div>
          </div>
        </>
      )}
    </BuyerShell>
  );
}
