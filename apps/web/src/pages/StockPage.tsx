import { useState } from 'react';
import { formatPackaging, type PackagingType } from '@gawjaay/shared';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatDateTime, packagingLine, packagingName } from '../lib/format';
import { useStore } from '../context/StoreContext';
import { Alert, Card, Chips, EmptyState, PageHead, Spinner } from '../components/ui';
import { Modal, ProductThumb } from '../components/product';

interface StockItem {
  storeId: string;
  storeName: string;
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  variantName: string;
  packaging: PackagingType;
  format: string | null;
  hasImage: boolean;
  quantity: number;
  threshold: number;
  low: boolean;
  out: boolean;
}

interface Movement {
  id: string;
  createdAt: string;
  type: string;
  quantity: number;
  reference: string | null;
  note: string | null;
  storeName: string;
  productId: string;
  productName: string;
  variantName: string;
  packaging: PackagingType;
  format: string | null;
  userName: string | null;
}

interface Product {
  id: string;
  name: string;
  packaging: PackagingType;
  format: string | null;
  purchasePrice: number;
  variants: Array<{ id: string; name: string }>;
}

const MOVEMENT_LABELS: Record<string, string> = {
  ENTRY: 'Entrée de stock',
  EXIT: 'Sortie',
  SALE: 'Vente',
  ONLINE_ORDER: 'Commande en ligne',
  RETURN: 'Retour',
  TRANSFER_IN: 'Transfert entrant',
  TRANSFER_OUT: 'Transfert sortant',
  ADJUSTMENT: 'Ajustement',
  COUNT: 'Inventaire',
  INITIAL: 'Stock initial',
};

type Filter = '' | 'in' | 'low' | 'out';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: '', label: 'Tout' },
  { value: 'in', label: 'En stock' },
  { value: 'low', label: 'Stock faible' },
  { value: 'out', label: 'Rupture' },
];

function stateOf(item: StockItem): 'in' | 'low' | 'out' {
  if (item.out) return 'out';
  if (item.low) return 'low';
  return 'in';
}

export function StockPage() {
  const { storeId } = useStore();
  const stock = useApi<{ items: StockItem[] }>(
    () => api.get(`/inventory${storeId ? `?storeId=${storeId}` : ''}`),
    [storeId],
  );
  const movements = useApi<{ movements: Movement[] }>(
    () => api.get(`/inventory/movements${storeId ? `?storeId=${storeId}` : ''}`),
    [storeId],
  );
  const products = useApi<{ items: Product[] }>(() => api.get('/products?pageSize=100'), []);

  const [filter, setFilter] = useState<Filter>('');
  const [entryFor, setEntryFor] = useState<StockItem | null>(null);
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = (stock.data?.items ?? []).filter((i) => (filter ? stateOf(i) === filter : true));
  const lowCount = (stock.data?.items ?? []).filter((i) => i.low && !i.out).length;
  const outCount = (stock.data?.items ?? []).filter((i) => i.out).length;

  function openEntry(item: StockItem) {
    setEntryFor(item);
    const product = products.data?.items.find((p) => p.id === item.productId);
    setQuantity('');
    setPurchasePrice(product?.purchasePrice ? String(product.purchasePrice) : '');
    setNote('');
    setError(null);
    setSuccess(null);
  }

  async function onEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!entryFor) return;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Indiquez une quantité supérieure à zéro.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ quantity: number }>(`/products/${entryFor.productId}/stock`, {
        storeId: entryFor.storeId,
        variantId: entryFor.variantId,
        quantity: qty,
        purchasePrice: purchasePrice ? Number(purchasePrice) : undefined,
        note: note || undefined,
      });
      setSuccess(`Stock mis à jour : ${formatPackaging(res.quantity, entryFor.packaging)}.`);
      setEntryFor(null);
      stock.reload();
      movements.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Entrée de stock impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Stock" subtitle="Ce que vous possédez maintenant — entrées, sorties et historique." />

      {success && <Alert kind="success">{success}</Alert>}

      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 'var(--s4)' }}>
        <div className="kpi-tile plain">
          <div className="stat-label">Références suivies</div>
          <div className="stat-value">{stock.data?.items.length ?? 0}</div>
        </div>
        <div className="kpi-tile plain">
          <div className="stat-label">Stock faible</div>
          <div className="stat-value" style={lowCount > 0 ? { color: 'var(--warn)' } : undefined}>
            {lowCount}
          </div>
        </div>
        <div className="kpi-tile plain">
          <div className="stat-label">En rupture</div>
          <div className="stat-value" style={outCount > 0 ? { color: 'var(--danger)' } : undefined}>
            {outCount}
          </div>
        </div>
      </div>

      <Card
        title="État du stock"
        actions={<Chips options={FILTERS} value={filter} onChange={setFilter} allLabel={undefined} />}
      >
        {stock.loading && <Spinner />}
        {stock.error && <Alert kind="error">{stock.error}</Alert>}
        {stock.data && stock.data.items.length === 0 && (
          <EmptyState title="Aucun stock" hint="Ajoutez un produit pour commencer à suivre votre stock." />
        )}
        {stock.data && stock.data.items.length > 0 && items.length === 0 && (
          <EmptyState title="Aucun produit dans ce filtre" hint="Essayez un autre filtre." />
        )}
        {items.length > 0 && (
          <div className="stock-grid">
            {items.map((item) => {
              const tone = stateOf(item);
              const label = tone === 'out' ? 'Rupture' : tone === 'low' ? 'Stock faible' : 'En stock';
              return (
                <article className="stock-card" key={`${item.storeId}-${item.variantId}`}>
                  <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
                    <div className="merchant-media" style={{ width: 54, height: 54, aspectRatio: 'auto', borderRadius: 'var(--r-sm)', flex: 'none' }}>
                      <ProductThumb productId={item.productId} name={item.productName} hasImage={item.hasImage} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="merchant-name">{item.productName}</div>
                      <div className="merchant-pack small">
                        {packagingLine(item.packaging, item.format)}
                        {item.variantName && item.variantName !== 'Standard' ? ` · ${item.variantName}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="stock-qty">{formatPackaging(item.quantity, item.packaging)}</div>
                  <div className="row between">
                    <span className={`stock-state ${tone}`}>{label}</span>
                    <span className="small muted">Seuil : {item.threshold}</span>
                  </div>
                  <button className="btn btn-secondary btn-sm btn-block" onClick={() => openEntry(item)}>
                    + Ajouter du stock
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Historique">
        <p className="small muted" style={{ marginTop: 0 }}>
          Chaque mouvement de stock est enregistré.
        </p>
        {movements.loading && <Spinner />}
        {movements.error && <Alert kind="error">{movements.error}</Alert>}
        {movements.data && movements.data.movements.length === 0 && (
          <EmptyState title="Aucun mouvement" hint="Les entrées, ventes et ajustements apparaîtront ici." />
        )}
        {movements.data && movements.data.movements.length > 0 && (
          <div>
            {movements.data.movements.slice(0, 50).map((m) => (
              <div className="movement-row" key={m.id}>
                <div className="movement-main">
                  <div style={{ fontWeight: 600 }}>{m.productName}</div>
                  <div className="small muted">
                    {MOVEMENT_LABELS[m.type] ?? m.type}
                    {m.userName ? ` · ${m.userName}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className={`movement-qty ${m.quantity >= 0 ? 'in' : 'out'}`}>
                    {m.quantity >= 0 ? '+' : ''}
                    {m.quantity}
                  </div>
                  <div className="tiny muted">{formatDateTime(m.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {entryFor && (
        <Modal
          title="Ajouter du stock"
          onClose={() => setEntryFor(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEntryFor(null)} disabled={busy}>
                Annuler
              </button>
              <button type="submit" form="stock-entry-form" className="btn" disabled={busy}>
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </>
          }
        >
          <form id="stock-entry-form" onSubmit={onEntry} noValidate>
            {error && <Alert kind="error">{error}</Alert>}
            <p className="small muted" style={{ marginTop: 0 }}>
              {entryFor.productName} — stock actuel {formatPackaging(entryFor.quantity, entryFor.packaging)}
            </p>
            <div className="field">
              <label htmlFor="s-qty">Quantité reçue ({packagingName(entryFor.packaging, true).toLowerCase()})</label>
              <input id="s-qty" type="number" inputMode="numeric" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} autoFocus />
            </div>
            <div className="field">
              <label htmlFor="s-price">Prix d'achat unitaire (optionnel)</label>
              <input
                id="s-price"
                type="number"
                inputMode="numeric"
                min="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="s-note">Fournisseur / note (optionnel)</label>
              <input id="s-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
