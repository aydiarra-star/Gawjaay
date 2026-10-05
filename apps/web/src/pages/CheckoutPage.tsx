import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { formatXOF } from '../lib/format';
import { SENEGAL_REGIONS } from '@gawjaay/shared';
import { Alert, EmptyState } from '../components/ui';
import { BuyerShell } from '../components/BuyerHeader';
import { IconCart } from '../components/icons';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

/** Clé d'idempotence générée une fois par session de checkout (double clic / retry sûr). */
function newCheckoutId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `chk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function CheckoutPage() {
  const { user } = useAuth();
  const cart = useCart();
  const navigate = useNavigate();
  const idRef = useRef<string | null>(null);
  if (idRef.current === null) idRef.current = newCheckoutId();

  const [name, setName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [region, setRegion] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'MANUAL' | 'CARD'>('MANUAL');
  const [stripeAvailable, setStripeAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentCancelled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('payment') === 'cancelled';

  const requiresDeliveryAddress = false; // Retrait en boutique prioritaire ; adresse facultative.

  useEffect(() => {
    void api.get<{ onlinePaymentEnabled: boolean }>('/payments/capabilities', { publicRoute: true })
      .then((data) => setStripeAvailable(data.onlinePaymentEnabled))
      .catch(() => setStripeAvailable(false));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!user) {
      navigate('/login', { state: { from: '/checkout' } });
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ orderId: string }>('/me/orders', {
        storeId: cart.storeId,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        region: region || undefined,
        deliveryAddress: address.trim() || undefined,
        deliveryRegion: region || undefined,
        note: note.trim() || undefined,
        clientRequestId: idRef.current,
        items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      });
      if (paymentMethod === 'CARD') {
        const payment = await api.post<{ checkoutUrl: string }>('/payments/stripe/checkout', { orderId: res.orderId });
        window.location.assign(payment.checkoutUrl);
        return;
      }
      cart.clear();
      navigate(`/orders/${res.orderId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Commande impossible');
    } finally {
      setBusy(false);
    }
  }

  if (cart.items.length === 0) {
    return (
      <BuyerShell>
        <div className="card">
          <EmptyState
            title="Panier vide"
            hint="Ajoutez des produits avant de commander."
            icon={<IconCart size={22} />}
            action={
              <Link to="/marketplace" className="btn">
                Explorer la marketplace
              </Link>
            }
          />
        </div>
      </BuyerShell>
    );
  }

  return (
    <BuyerShell>
      <div className="page-head">
        <div>
          <h1>Commander</h1>
          <p>Retrait en boutique · choisissez votre mode de règlement au moment de commander.</p>
        </div>
      </div>

      {!user && (
        <Alert kind="warning">
          Connectez-vous pour commander. Votre panier est conservé.{' '}
          <Link to="/login" state={{ from: '/checkout' }}>
            Se connecter
          </Link>
        </Alert>
      )}
      {paymentCancelled && <Alert kind="warning">Paiement annulé. Votre commande n’a pas été créée pour ce paiement ; votre panier est conservé.</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      <div className="card">
        <strong>{cart.storeName}</strong>
        <ul className="small muted" style={{ margin: '8px 0', paddingLeft: 18 }}>
          {cart.items.map((i) => (
            <li key={i.variantId}>
              {i.quantity} × {i.name}
              {i.variantName ? ` (${i.variantName})` : ''} — {formatXOF(i.unitPrice * i.quantity)}
            </li>
          ))}
        </ul>
        <div className="row between">
          <span>Total (recalculé serveur)</span>
          <strong>{formatXOF(cart.subtotal)}</strong>
        </div>
      </div>

      <form onSubmit={submit} noValidate style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Vos coordonnées</h2>
          <div className="form-row">
            <div className="field">
              <label htmlFor="c-name">Nom</label>
              <input id="c-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="c-phone">Téléphone</label>
              <input id="c-phone" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+221…" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="c-region">Région (optionnel)</label>
            <select id="c-region" value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">—</option>
              {SENEGAL_REGIONS.map((r) => (
                <option key={r.code} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-address">Adresse / repère (optionnel)</label>
            <input id="c-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Quartier, repère…" />
          </div>
          <div className="field">
            <label htmlFor="c-note">Note pour le vendeur (optionnel)</label>
            <textarea id="c-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="c-payment">Paiement</label>
            <select id="c-payment" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'MANUAL' | 'CARD')}>
              <option value="MANUAL">Payer auprès du vendeur</option>
              {stripeAvailable && <option value="CARD">Carte bancaire · Stripe</option>}
            </select>
            {paymentMethod === 'CARD' && <p className="field-hint">Vous serez redirigé vers Stripe pour un paiement sécurisé. La commande sera confirmée après validation du paiement.</p>}
          </div>
          <p className="field-hint">
            Retrait en boutique. {requiresDeliveryAddress ? '' : 'La livraison n’est pas proposée ici : le vendeur vous contacte pour convenir des modalités.'}
          </p>
          <button className="btn btn-lg btn-block" type="submit" disabled={busy}>
            {busy ? 'Envoi…' : 'Confirmer la commande'}
          </button>
        </div>
      </form>
    </BuyerShell>
  );
}
