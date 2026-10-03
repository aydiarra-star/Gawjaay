import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { COMMON_PACKAGING, PACKAGING_LABELS, PACKAGING_TYPES, formatPackaging, type PackagingType } from '@gawjaay/shared';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatXOF, packagingLine, formatDateTime } from '../lib/format';
import { useStore } from '../context/StoreContext';
import { Alert, Card, EmptyState, PageHead, Spinner } from '../components/ui';
import { Modal, PhotoPicker, ProductThumb } from '../components/product';

interface Product {
  id: string;
  name: string;
  sku: string;
  packaging: PackagingType;
  format: string | null;
  price: number;
  promoPrice: number | null;
  purchasePrice: number;
  alertThreshold: number;
  hasImage: boolean;
  imageUrl: string | null;
  marketplaceVisible: boolean;
  marketplaceSellable?: boolean;
  marketplaceBlocked?: boolean;
  category: { id: string; name: string } | null;
  variants: Array<{ id: string; name: string; sku: string; lowStockThreshold: number }>;
}

interface PriceHistoryEntry {
  id: string;
  field: 'purchasePrice' | 'price' | string;
  oldValue: number | null;
  newValue: number;
  createdAt: string;
}

interface ProductsResponse {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}

interface FormState {
  name: string;
  categoryName: string;
  packaging: PackagingType;
  format: string;
  purchasePrice: string;
  price: string;
  initialStock: string;
  alertThreshold: string;
  variantName: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  categoryName: '',
  packaging: 'sac',
  format: '',
  purchasePrice: '',
  price: '',
  initialStock: '',
  alertThreshold: '',
  variantName: 'Standard',
};

function stockState(quantity: number, threshold: number): { label: string; tone: 'in' | 'low' | 'out' } {
  if (quantity <= 0) return { label: 'Rupture', tone: 'out' };
  if (threshold > 0 && quantity <= threshold) return { label: 'Stock faible', tone: 'low' };
  return { label: 'En stock', tone: 'in' };
}

export function ProductsPage() {
  const navigate = useNavigate();
  const { storeId } = useStore();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Product | null>(null);
  const [manage, setManage] = useState<Product | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [manageBusy, setManageBusy] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);

  const { data, loading, error: loadError, reload } = useApi<ProductsResponse>(
    () =>
      api.get<ProductsResponse>(
        `/products?pageSize=100${query ? `&search=${encodeURIComponent(query)}` : ''}${categoryId ? `&categoryId=${categoryId}` : ''}`,
      ),
    [query, categoryId],
  );
  const categories = useApi<{ categories: Array<{ id: string; name: string }> }>(() => api.get('/categories'), []);
  const stock = useApi<{ items: Array<{ variantId: string; quantity: number }> }>(
    () => api.get(`/inventory${storeId ? `?storeId=${storeId}` : ''}`),
    [storeId],
  );
  const quantityByVariant = new Map((stock.data?.items ?? []).map((i) => [i.variantId, i.quantity]));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openForm() {
    setForm(EMPTY_FORM);
    setPhoto(null);
    setError(null);
    setSaved(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setSaved(null);
    setError(null);
  }

  async function openManage(p: Product) {
    setManage(p);
    setPromoInput(p.promoPrice != null ? String(p.promoPrice) : '');
    setManageError(null);
    setHistory([]);
    try {
      const res = await api.get<{ priceHistory: PriceHistoryEntry[] }>(`/products/${p.id}`);
      setHistory(res.priceHistory ?? []);
    } catch {
      /* l'historique est optionnel */
    }
  }

  async function patchProduct(id: string, body: Record<string, unknown>): Promise<Product | null> {
    setManageError(null);
    setManageBusy(true);
    try {
      const res = await api.patch<{ product: Product }>(`/products/${id}`, body);
      setManage(res.product);
      reload();
      return res.product;
    } catch (err) {
      setManageError(err instanceof ApiError ? err.message : 'Mise à jour impossible');
      return null;
    } finally {
      setManageBusy(false);
    }
  }

  function shareProduct(p: Product) {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}marketplace?search=${encodeURIComponent(p.name)}`;
    const text = `${p.name} — ${formatXOF(p.promoPrice ?? p.price)} · sur GawJaay`;
    const wa = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
    window.open(wa, '_blank', 'noopener');
  }

  async function ensureCategoryId(): Promise<string | undefined> {
    const name = form.categoryName.trim();
    if (!name) return undefined;
    const existing = data?.items.find((p) => p.category?.name.toLowerCase() === name.toLowerCase())?.category;
    if (existing) return existing.id;
    try {
      const res = await api.post<{ category: { id: string } }>('/categories', { name });
      return res.category.id;
    } catch {
      // Catégorie déjà créée ailleurs ou permission manquante : on n'échoue pas la création du produit.
      const cats = await api.get<{ categories: Array<{ id: string; name: string }> }>('/categories');
      return cats.categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id;
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError('Indiquez le nom du produit.');
      return;
    }
    setBusy(true);
    try {
      const categoryId = await ensureCategoryId();
      const res = await api.post<{ product: Product }>('/products/merchant', {
        name: form.name.trim(),
        categoryId,
        packaging: form.packaging,
        format: form.format.trim() || undefined,
        purchasePrice: Number(form.purchasePrice || 0),
        price: Number(form.price || 0),
        alertThreshold: Number(form.alertThreshold || 0),
        imageData: photo ?? undefined,
        storeId: storeId ?? undefined,
        initialStock: Number(form.initialStock || 0),
        variants: [{ name: form.variantName.trim() || 'Standard' }],
      });
      setSaved(res.product);
      setForm(EMPTY_FORM);
      setPhoto(null);
      reload();
      stock.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Création impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title="Produits"
        subtitle="Ce que vous vendez. Ajoutez un produit, sa photo, son prix et son stock."
        actions={
          <button className="btn btn-lg" onClick={openForm}>
            + Ajouter un produit
          </button>
        }
      />

      {loadError && <Alert kind="error">{loadError}</Alert>}

      <Card
        title="Mon catalogue"
        actions={
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search);
            }}
          >
            <select
              aria-label="Filtrer par catégorie"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              style={{ width: 'auto', maxWidth: 170 }}
            >
              <option value="">Toutes catégories</option>
              {(categories.data?.categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              aria-label="Rechercher un produit"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              style={{ width: 160 }}
              type="search"
            />
            <button className="btn btn-secondary btn-sm" type="submit">
              OK
            </button>
          </form>
        }
      >
        {loading && <Spinner />}
        {data && data.items.length === 0 && (
          <EmptyState
            title="Aucun produit"
            hint="Appuyez sur « Ajouter un produit » pour enregistrer votre premier article."
            action={
              <button className="btn" onClick={openForm}>
                + Ajouter un produit
              </button>
            }
          />
        )}
        {data && data.items.length > 0 && (
          <div className="merchant-grid">
            {data.items.map((p) => {
              const variant = p.variants[0];
              const qty = variant ? quantityByVariant.get(variant.id) ?? 0 : 0;
              const threshold = variant?.lowStockThreshold || p.alertThreshold;
              const state = stockState(qty, threshold);
              return (
                <article className="merchant-card" key={p.id}>
                  <div className="merchant-media">
                    <ProductThumb productId={p.id} name={p.name} hasImage={p.hasImage} imageUrl={p.imageUrl} />
                  </div>
                  <div className="merchant-body">
                    <div className="merchant-name">{p.name}</div>
                    <div className="merchant-pack">{packagingLine(p.packaging, p.format)}</div>
                    <div className="merchant-price">
                      {formatXOF(p.promoPrice ?? p.price)}
                      {p.promoPrice != null && <span className="was">{formatXOF(p.price)}</span>}
                    </div>
                    <div className="merchant-stock">
                      Stock : <strong>{formatPackaging(qty, p.packaging)}</strong>{' '}
                      <span className={`stock-state ${state.tone}`}>{state.label}</span>
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      {p.marketplaceVisible ? (
                        <span className="badge badge-success">Publié marketplace</span>
                      ) : (
                        <span className="badge">Non publié</span>
                      )}
                      {p.marketplaceBlocked && <span className="badge badge-warning">Publié mais sans stock</span>}
                      {p.promoPrice != null && <span className="badge badge-primary">Promo</span>}
                    </div>
                    <div className="merchant-actions">
                      <button className="btn btn-sm" onClick={() => navigate(`/app/pos?product=${p.id}`)}>
                        Vendre
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => openManage(p)}>
                        Gérer
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      {showForm && (
        <Modal
          title={saved ? 'Produit enregistré' : 'Ajouter un produit'}
          onClose={closeForm}
          footer={
            saved ? (
              <>
                <button className="btn btn-secondary" onClick={openForm}>
                  Ajouter un autre
                </button>
                <button className="btn" onClick={closeForm}>
                  Terminé
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-secondary" onClick={closeForm} disabled={busy}>
                  Annuler
                </button>
                <button type="submit" form="merchant-product-form" className="btn" disabled={busy}>
                  {busy ? 'Enregistrement…' : 'Enregistrer le produit'}
                </button>
              </>
            )
          }
        >
          {saved ? (
            <div className="stack">
              <div className="merchant-summary">
                <div className="merchant-media">
                  <ProductThumb productId={saved.id} name={saved.name} hasImage={saved.hasImage} imageUrl={saved.imageUrl} />
                </div>
                <div>
                  <div className="merchant-name">{saved.name}</div>
                  <div className="merchant-pack">{packagingLine(saved.packaging, saved.format)}</div>
                  <div className="merchant-price">{formatXOF(saved.promoPrice ?? saved.price)}</div>
                </div>
              </div>
              <p className="small muted">
                Stock : <strong>{formatPackaging(Number(form.initialStock || 0), saved.packaging)}</strong> — le produit est
                immédiatement disponible à la vente.
              </p>
            </div>
          ) : (
            <form id="merchant-product-form" onSubmit={onCreate} noValidate>
              {error && <Alert kind="error">{error}</Alert>}

              <PhotoPicker value={photo} onChange={setPhoto} onError={setError} busy={busy} />

              <div className="field">
                <label htmlFor="p-name">Nom du produit</label>
                <input
                  id="p-name"
                  required
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="Ex. Riz"
                  autoComplete="off"
                />
              </div>

              <div className="field">
                <label htmlFor="p-category">Catégorie (optionnel)</label>
                <input
                  id="p-category"
                  value={form.categoryName}
                  onChange={(e) => update('categoryName', e.target.value)}
                  placeholder="Ex. Alimentaire"
                  autoComplete="off"
                />
              </div>

              <div className="form-row">
                <div className="field">
                  <label htmlFor="p-packaging">Conditionnement</label>
                  <select id="p-packaging" value={form.packaging} onChange={(e) => update('packaging', e.target.value as PackagingType)}>
                    {COMMON_PACKAGING.map((p) => (
                      <option key={p} value={p}>
                        {PACKAGING_LABELS[p].singular}
                      </option>
                    ))}
                    <optgroup label="Autres unités">
                      {PACKAGING_TYPES.filter((p) => !COMMON_PACKAGING.includes(p)).map((p) => (
                        <option key={p} value={p}>
                          {PACKAGING_LABELS[p].singular}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="p-format">Format (optionnel)</label>
                  <input
                    id="p-format"
                    value={form.format}
                    onChange={(e) => update('format', e.target.value)}
                    placeholder="Ex. 50 kg"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="field">
                  <label htmlFor="p-cost">Prix d'achat (FCFA)</label>
                  <input
                    id="p-cost"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={form.purchasePrice}
                    onChange={(e) => update('purchasePrice', e.target.value)}
                    placeholder="12000"
                  />
                </div>
                <div className="field">
                  <label htmlFor="p-price">Prix de vente (FCFA)</label>
                  <input
                    id="p-price"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={form.price}
                    onChange={(e) => update('price', e.target.value)}
                    placeholder="14000"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="field">
                  <label htmlFor="p-stock">Stock initial</label>
                  <input
                    id="p-stock"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={form.initialStock}
                    onChange={(e) => update('initialStock', e.target.value)}
                    placeholder="10"
                  />
                  <p className="field-hint">Ce que vous possédez aujourd'hui.</p>
                </div>
                <div className="field">
                  <label htmlFor="p-threshold">Seuil d'alerte (optionnel)</label>
                  <input
                    id="p-threshold"
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={form.alertThreshold}
                    onChange={(e) => update('alertThreshold', e.target.value)}
                    placeholder="2"
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="p-variant">Variante (optionnel)</label>
                <input
                  id="p-variant"
                  value={form.variantName}
                  onChange={(e) => update('variantName', e.target.value)}
                  placeholder="Ex. Sac 50 kg"
                  autoComplete="off"
                />
                <p className="field-hint">Laissez « Standard » pour un produit à taille unique.</p>
              </div>
            </form>
          )}
        </Modal>
      )}

      {manage && (
        <Modal
          title={`Gérer — ${manage.name}`}
          onClose={() => setManage(null)}
          footer={
            <button type="button" className="btn btn-secondary" onClick={() => setManage(null)}>
              Fermer
            </button>
          }
        >
          <div className="stack">
            {manageError && <Alert kind="error">{manageError}</Alert>}

            <div className="card" style={{ padding: 16 }}>
              <div className="stat-label">Publication marketplace</div>
              <p className="small muted" style={{ margin: '6px 0 10px' }}>
                Un produit publié apparaît dans la marketplace lorsqu'il est en stock. Prix de vente actuel :{' '}
                <strong>{formatXOF(manage.price)}</strong>.
              </p>
              <button
                className={`btn btn-sm ${manage.marketplaceVisible ? 'btn-secondary' : ''}`}
                disabled={manageBusy}
                onClick={() => patchProduct(manage.id, { marketplaceVisible: !manage.marketplaceVisible })}
              >
                {manage.marketplaceVisible ? 'Retirer de la marketplace' : 'Publier sur la marketplace'}
              </button>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div className="stat-label">Prix promotionnel</div>
              <p className="small muted" style={{ margin: '6px 0 10px' }}>
                Un prix promo doit être inférieur au prix de vente. Le serveur refuse toute valeur incohérente.
              </p>
              <div className="row" style={{ gap: 8 }}>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value)}
                  placeholder="Ex. 11000"
                />
                <button
                  className="btn btn-sm"
                  disabled={manageBusy}
                  onClick={() => patchProduct(manage.id, { promoPrice: Number(promoInput || 0) })}
                >
                  Définir
                </button>
                {manage.promoPrice != null && (
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={manageBusy}
                    onClick={() => {
                      setPromoInput('');
                      patchProduct(manage.id, { promoPrice: null });
                    }}
                  >
                    Retirer
                  </button>
                )}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div className="stat-label">Partager</div>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => shareProduct(manage)}>
                  WhatsApp
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const url = `${window.location.origin}${import.meta.env.BASE_URL}marketplace?search=${encodeURIComponent(manage.name)}`;
                    void navigator.clipboard?.writeText(url);
                  }}
                >
                  Copier le lien
                </button>
              </div>
            </div>

            {history.length > 0 && (
              <div className="card" style={{ padding: 16 }}>
                <div className="stat-label">Historique des prix</div>
                <div className="table-wrap" style={{ border: 'none', marginTop: 8 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Champ</th>
                        <th className="num">Avant</th>
                        <th className="num">Après</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id}>
                          <td className="small">{formatDateTime(h.createdAt)}</td>
                          <td>{h.field === 'purchasePrice' ? "Prix d'achat" : 'Prix de vente'}</td>
                          <td className="num">{h.oldValue != null ? formatXOF(h.oldValue) : '—'}</td>
                          <td className="num">{formatXOF(h.newValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
