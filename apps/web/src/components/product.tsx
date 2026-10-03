import { useEffect, useRef, useState, type ReactNode } from 'react';
import { API_BASE } from '../lib/api';
import { getAccessToken, getOrganizationId } from '../lib/session';

/* ------------------------------------------------------------------ */
/* Miniature produit (liste, POS, fiche)                               */
/* ------------------------------------------------------------------ */

const objectUrlCache = new Map<string, string>();

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const orgId = getOrganizationId();
  if (orgId) headers['x-organization-id'] = orgId;
  return headers;
}

/**
 * Affiche la photo d'un produit sans exposer d'URL devinable : la route
 * marchande est protégée par l'en-tête d'organisation, chargée puis mise en
 * cache. Repli sur l'initiale du produit quand aucune photo n'existe.
 */
export function ProductThumb({
  productId,
  name,
  hasImage,
  imageUrl,
  className = 'product-thumb',
}: {
  productId: string;
  name: string;
  hasImage?: boolean;
  imageUrl?: string | null;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(() => imageUrl ?? objectUrlCache.get(productId) ?? null);

  useEffect(() => {
    if (imageUrl || !hasImage) return;
    const cached = objectUrlCache.get(productId);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/products/${productId}/photo`, { headers: authHeaders() })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('no photo'))))
      .then((blob) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        objectUrlCache.set(productId, objectUrl);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [productId, hasImage, imageUrl]);

  if (url) return <img className={className} src={url} alt={name} loading="lazy" />;
  return (
    <div className={className} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Photo publique (marketplace / vitrine)                              */
/* ------------------------------------------------------------------ */

/**
 * Photo d'un produit exposé publiquement. Utilise l'URL externe si fournie,
 * sinon la route publique (sans authentification) qui sert la photo persistée.
 */
export function PublicProductImage({
  productId,
  name,
  hasImage,
  imageUrl,
  className = 'product-thumb',
}: {
  productId: string;
  name: string;
  hasImage?: boolean;
  imageUrl?: string | null;
  className?: string;
}) {
  const src = imageUrl ?? (hasImage ? `${API_BASE}/public/products/${productId}/photo` : null);
  if (src) return <img className={className} src={src} alt={name} loading="lazy" />;
  return (
    <div className={className} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sélecteur de photo (appareil / galerie)                             */
/* ------------------------------------------------------------------ */

export function PhotoPicker({
  value,
  onChange,
  onError,
  busy,
  label = 'Photo du produit',
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  onError?: (message: string) => void;
  busy?: boolean;
  label?: string;
}) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    void import('../lib/image').then(async ({ prepareProductImage }) => {
      try {
        const prepared = await prepareProductImage(file);
        onChange(prepared.dataUrl);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Photo illisible');
      }
    });
  }

  return (
    <div className="photo-field">
      <span className="photo-field-label">{label}</span>
      <div className={`photo-preview${value ? ' has-image' : ''}`}>
        {value ? (
          <img src={value} alt="Aperçu de la photo du produit" />
        ) : (
          <span className="photo-placeholder" aria-hidden="true">
            📷
          </span>
        )}
        {busy && <span className="photo-loading" role="status">Compression…</span>}
      </div>

      <div className="photo-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => cameraRef.current?.click()}>
          📷 Prendre une photo
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => galleryRef.current?.click()}>
          🖼️ Choisir une photo
        </button>
        {value && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
            Supprimer
          </button>
        )}
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fenêtre modale (bottom-sheet sur mobile)                            */
/* ------------------------------------------------------------------ */

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
