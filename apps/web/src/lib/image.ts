import { MAX_IMAGE_BYTES, parseImageDataUrl } from '@gawjaay/shared';

/**
 * Prépare une photo prise ou choisie par le marchand AVANT l'envoi :
 * redimensionnement et compression JPEG côté navigateur. Objectif : rester léger
 * (Render Free, réseau mobile) et ne jamais dépasser la limite serveur.
 *
 * Aucune donnée n'est envoyée au serveur sans passer par ici.
 */

const MAX_DIMENSION = 1280;

export interface PreparedImage {
  dataUrl: string;
  bytes: number;
}

async function fileToBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Lecture de l’image impossible'));
    };
    img.src = url;
  });
}

function drawToDataUrl(source: ImageBitmap | HTMLImageElement, width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

/**
 * Compresse une image et garantit qu'elle tient sous la limite partagée.
 * Renvoie une data-URI JPEG. Réduit progressivement la qualité si nécessaire.
 */
export async function prepareProductImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choisissez un fichier image.');
  }
  const bitmap = await fileToBitmap(file);
  const naturalWidth = 'width' in bitmap ? bitmap.width : 0;
  const naturalHeight = 'height' in bitmap ? bitmap.height : 0;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  let quality = 0.82;
  let dataUrl = drawToDataUrl(bitmap, width, height);
  let parsed = parseImageDataUrl(dataUrl);
  while ((!parsed || parsed.bytes > MAX_IMAGE_BYTES) && quality > 0.4) {
    quality -= 0.12;
    dataUrl = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponible');
      ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', quality);
    })();
    parsed = parseImageDataUrl(dataUrl);
  }
  if (!parsed) {
    throw new Error('Image trop lourde, même après compression.');
  }
  if ('close' in bitmap) bitmap.close();
  return { dataUrl, bytes: parsed.bytes };
}

/** URL d'affichage d'une photo : data-URI directe, sinon route serveur. */
export function productPhotoUrl(productId: string, hasImage: boolean | undefined, imageUrl?: string | null): string | null {
  if (imageUrl) return imageUrl;
  if (hasImage) return `/products/${productId}/photo`;
  return null;
}
