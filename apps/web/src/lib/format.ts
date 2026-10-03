import { formatXOF, formatPackaging, PACKAGING_LABELS, isPackagingType, type PackagingType } from '@gawjaay/shared';

export { formatXOF, formatPackaging, PACKAGING_LABELS };

/** « sac » → « Sac » : le conditionnement ouvre une ligne, il se lit capitalisé. */
export function packagingName(packaging: string | null | undefined, plural = false): string {
  const key: PackagingType = isPackagingType(packaging) ? packaging : 'unite';
  const label = PACKAGING_LABELS[key];
  const value = plural ? label.plural : label.singular;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** « Sac · 50 kg » (ou « Sac » sans format). */
export function packagingLine(packaging: string | null | undefined, format: string | null | undefined): string {
  const name = packagingName(packaging);
  return format ? `${name} · ${format}` : name;
}

export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
