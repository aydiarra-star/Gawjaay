import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE } from '../lib/api';
import { getAccessToken, getOrganizationId } from '../lib/session';

/* ------------------------------------------------------------------ */
/* Miniature produit (liste, POS, fiche)                               */
/* ------------------------------------------------------------------ */

const objectUrlCache = new Map<string, string>();
const objectUrlInflight = new Map<string, Promise<string>>();

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const orgId = getOrganizationId();
  if (orgId) headers['x-organization-id'] = orgId;
  return headers;
}

/** Charge une photo marchande une seule fois et conserve son Blob URL. */
export async function loadProductPhoto(productId: string, hasImage?: boolean, imageUrl?: string | null): Promise<string | null> {
  if (imageUrl) return imageUrl;
  if (!hasImage) return null;
  const cached = objectUrlCache.get(productId);
  if (cached) return cached;
  const pending = objectUrlInflight.get(productId);
  if (pending) return pending;
  const request = fetch(API_BASE + '/products/' + productId + '/photo', { headers: authHeaders() })
    .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('Photo indisponible'))))
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      objectUrlCache.set(productId, objectUrl);
      return objectUrl;
    })
    .finally(() => objectUrlInflight.delete(productId));
  objectUrlInflight.set(productId, request);
  return request;
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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    let cancelled = false;
    void loadProductPhoto(productId, hasImage, imageUrl)
      .then((next) => {
        if (!cancelled && next) setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, [productId, hasImage, imageUrl]);

  if (url && !failed) return <img className={className} src={url} alt={name} loading="lazy" onError={() => setFailed(true)} />;
  return (
    <div className={className} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/** Invalide la photo en cache après un remplacement/suppression. */
export function invalidateProductPhotoCache(productId: string): void {
  const url = objectUrlCache.get(productId);
  if (url) URL.revokeObjectURL(url);
  objectUrlCache.delete(productId);
}

/** URL (blob) de la photo marchande déjà chargée et mise en cache, sinon null. */
export function getCachedProductPhoto(productId: string): string | null {
  return objectUrlCache.get(productId) ?? null;
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
  const src = publicProductImageSrc({ productId, hasImage, imageUrl });
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed) return <img className={className} src={src} alt={name} loading="lazy" onError={() => setFailed(true)} />;
  return (
    <div className={className} aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

/** Source de la photo publique d'un produit (URL externe prioritaire, sinon route serveur). */
export function publicProductImageSrc({
  productId,
  hasImage,
  imageUrl,
}: {
  productId: string;
  hasImage?: boolean;
  imageUrl?: string | null;
}): string | null {
  return imageUrl ?? (hasImage ? `${API_BASE}/public/products/${productId}/photo` : null);
}

/* ------------------------------------------------------------------ */
/* Visionneuse d'image (lightbox maîtrisée)                            */
/* ------------------------------------------------------------------ */

/**
 * Affiche une image en grand SANS zoom forcé : `object-fit: contain`, taille
 * bornée par le viewport (safe areas incluses), jamais plus grande que
 * nécessaire même si la résolution d'origine est élevée. Fermeture par bouton,
 * clic sur l'arrière-plan ou Échap. Galerie (points + flèches) si plusieurs
 * images, avec navigation clavier et tactile.
 */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
  title,
}: {
  images: Array<{ src: string; alt: string }>;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  title?: string;
}) {
  const count = images.length;
  const safeIndex = count ? Math.min(Math.max(index, 0), count - 1) : 0;
  const current = images[safeIndex];
  const [imageError, setImageError] = useState(false);

  useEffect(() => setImageError(false), [current?.src]);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && count > 1) onIndexChange((safeIndex + 1) % count);
      else if (e.key === 'ArrowLeft' && count > 1) onIndexChange((safeIndex - 1 + count) % count);
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [count, safeIndex, current, onClose, onIndexChange]);

  if (!current || typeof document === 'undefined') return null;

  const go = (delta: number) => onIndexChange((safeIndex + delta + count) % count);
  const content = (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={title ?? 'Aperçu de l’image'} onClick={onClose}>
      <button type="button" className="lightbox-close" onClick={onClose} aria-label="Fermer l’aperçu">✕</button>

      {count > 1 && (
        <button type="button" className="lightbox-nav prev" aria-label="Image précédente" onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button>
      )}

      <figure className="lightbox-stage" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-image-frame">
          {!imageError ? (
            <img
              src={current.src}
              alt={current.alt}
              decoding="async"
              fetchPriority="high"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="lightbox-image-error" role="status">
              <strong>Photo indisponible</strong>
              <span>Impossible d’afficher cette image pour le moment.</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Fermer</button>
            </div>
          )}
        </div>
        {title && <figcaption>{title}</figcaption>}
      </figure>

      {count > 1 && (
        <button type="button" className="lightbox-nav next" aria-label="Image suivante" onClick={(e) => { e.stopPropagation(); go(1); }}>›</button>
      )}

      {count > 1 && (
        <div className="lightbox-dots" role="tablist" aria-label="Choisir une image">
          {images.map((img, i) => (
            <button key={`${img.src}-${i}`} type="button" role="tab" aria-selected={i === safeIndex} aria-label={`Image ${i + 1} sur ${count}`} className={`lightbox-dot${i === safeIndex ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); onIndexChange(i); }} />
          ))}
        </div>
      )}
    </div>
  );

  // Portal vers body : la lightbox ne peut plus être contrainte par un parent
  // transform/overflow et reste réellement plein écran sur iOS et desktop.
  return createPortal(content, document.body);
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
