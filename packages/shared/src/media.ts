/**
 * Règles communes pour les photos produit, partagées par l'API (validation
 * serveur, source de vérité) et par le web (compression avant envoi).
 *
 * Contrainte d'architecture : aucune infrastructure de stockage externe n'est
 * branchée. La photo est donc transportée comme data-URI et persistée en base.
 * On borne strictement sa taille pour rester compatible avec l'offre Render Free.
 */

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type ImageMime = (typeof IMAGE_MIME_TYPES)[number];

/** Taille maximale d'une photo après compression (octets décodés, ~700 Ko). */
export const MAX_IMAGE_BYTES = 700_000;

/** Taille maximale du corps de requête accepté par l'API (2 Mo). */
export const MAX_JSON_BODY = '2mb';

export interface ParsedImage {
  mime: ImageMime;
  /** Partie base64 (sans le préfixe data-URI). */
  base64: string;
  /** Nombre d'octets réellement décodés. */
  bytes: number;
}

export function isImageMime(value: unknown): value is ImageMime {
  return typeof value === 'string' && (IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

/**
 * Analyse une data-URI image et vérifie son type et sa taille.
 * Renvoie `null` si elle est invalide (type non autorisé, base64 corrompu, trop lourde).
 */
export function parseImageDataUrl(value: unknown): ParsedImage | null {
  if (typeof value !== 'string') return null;
  const match = /^data:([a-z0-9/+.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(value.trim());
  if (!match) return null;
  const mime = match[1].toLowerCase();
  if (!isImageMime(mime)) return null;
  const base64 = match[2];
  const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (bytes <= 0 || bytes > MAX_IMAGE_BYTES) return null;
  return { mime, base64, bytes };
}
