import type { ReactNode } from 'react';
import { IconDownload, IconSparkle, IconStar } from './icons';
import { formatXOF } from '../lib/format';

/* ------------------------------------------------------------------ */
/* Bannière phare « Teranga » : dégradé émeraude → or → orange         */
/* ------------------------------------------------------------------ */
export function TerangaBanner({
  eyebrow = 'Teranga Week',
  title,
  body,
  action,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <section className="teranga-banner">
      <div className="tb-main">
        <span className="tb-eyebrow">
          <IconSparkle size={14} />
          {eyebrow}
        </span>
        <h2>{title}</h2>
        {body && <p>{body}</p>}
      </div>
      {action}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Notation en étoiles dorées                                          */
/* ------------------------------------------------------------------ */
export function Stars({ value, count }: { value: number; count?: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="stars" aria-label={`${filled} sur 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <IconStar key={i} size={13} style={i < filled ? { fill: 'currentColor' } : undefined} className={i < filled ? undefined : 'off'} />
      ))}
      {count != null && <span className="stars-count">({count})</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Fiche produit téléchargeable (fichier généré à partir des données   */
/* réelles du serveur, aucune valeur inventée)                         */
/* ------------------------------------------------------------------ */
export interface DownloadableProduct {
  name: string;
  description?: string | null;
  category?: string | null;
  price: number;
  originalPrice?: number | null;
  shopName?: string | null;
  shopCity?: string | null;
  shopRegion?: string | null;
  shopPhone?: string | null;
  available?: number;
  variants?: Array<{ name: string; price: number; available: number }>;
}

function buildProductSheet(p: DownloadableProduct): string {
  const lines: string[] = [
    'GAWJAAY — FICHE PRODUIT',
    '=======================',
    '',
    `Produit      : ${p.name}`,
  ];
  if (p.category) lines.push(`Catégorie    : ${p.category}`);
  lines.push(`Prix         : ${formatXOF(p.price)}`);
  if (p.originalPrice) lines.push(`Prix barré   : ${formatXOF(p.originalPrice)}`);
  if (p.available != null) lines.push(`Disponible   : ${p.available}`);
  if (p.description) lines.push('', 'Description :', p.description);
  if (p.variants && p.variants.length > 0) {
    lines.push('', 'Variantes :');
    for (const v of p.variants) {
      lines.push(`  - ${v.name} — ${formatXOF(v.price)} (${v.available} en stock)`);
    }
  }
  if (p.shopName) {
    lines.push('', 'Boutique :');
    lines.push(`  Nom    : ${p.shopName}`);
    const place = [p.shopCity, p.shopRegion].filter(Boolean).join(', ');
    if (place) lines.push(`  Lieu   : ${place}`);
    if (p.shopPhone) lines.push(`  Contact: ${p.shopPhone}`);
  }
  lines.push('', '---', `Généré le ${new Date().toLocaleString('fr-FR')} — données fournies par GawJaay.`);
  return lines.join('\n');
}

function slugify(value: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'produit'
  );
}

/** Télécharge la fiche du produit. Sans `product` (chargement en cours), le bouton est inactif. */
export function ProductDownloadButton({
  product,
  label = 'Télécharger la fiche',
}: {
  product: DownloadableProduct | null;
  label?: string;
}) {
  function download() {
    if (!product) return;
    const blob = new Blob([buildProductSheet(product)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gawjaay-${slugify(product.name)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      className="btn-download"
      onClick={download}
      disabled={!product}
      aria-label={product ? `Télécharger la fiche de ${product.name}` : 'Chargement en cours'}
    >
      <IconDownload size={15} />
      {product ? label : 'Chargement…'}
    </button>
  );
}
