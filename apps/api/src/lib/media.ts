import { MAX_IMAGE_BYTES, parseImageDataUrl, type ParsedImage } from '@gawjaay/shared';
import { AppError } from './errors.js';

/**
 * Valide une photo transmise en data-URI et renvoie les colonnes à persister.
 * Lève une erreur explicite (400) si le format ou la taille est refusé : le
 * client ne doit jamais pouvoir stocker autre chose qu'une petite image.
 */
export function imageColumnsFromInput(imageData: unknown): { imageData: string | null; imageMime: string | null } {
  if (imageData === undefined || imageData === null || imageData === '') {
    return { imageData: null, imageMime: null };
  }
  const parsed: ParsedImage | null = parseImageDataUrl(imageData);
  if (!parsed) {
    throw AppError.badRequest(
      `Photo invalide : format accepté JPEG/PNG/WebP, ${Math.round(MAX_IMAGE_BYTES / 1000)} Ko maximum.`,
    );
  }
  return { imageData: `data:${parsed.mime};base64,${parsed.base64}`, imageMime: parsed.mime };
}

/**
 * Nettoie une entité produit/variante avant envoi au client : retire le base64
 * (lourd) et le remplace par un indicateur booléen, tout en conservant `imageUrl`.
 * Les routes qui ont réellement besoin de la photo utilisent `includeImage`.
 */
export function publicImage<T extends { imageData?: string | null; imageMime?: string | null }>(
  entity: T,
  includeImage = false,
): Omit<T, 'imageData'> & { hasImage: boolean; imageUrl: string | null; imageMime: string | null } {
  const { imageData, imageMime, ...rest } = entity;
  const imageUrl = (rest as { imageUrl?: string | null }).imageUrl ?? null;
  return {
    ...(rest as Omit<T, 'imageData'>),
    imageUrl,
    imageMime: imageMime ?? null,
    hasImage: Boolean(imageData || imageUrl),
    ...(includeImage && imageData ? { imageData } : {}),
  };
}
