import { prisma } from '../lib/prisma.js';
import { formatPackaging } from '@gawjaay/shared';

/**
 * Exports CSV à partir des données RÉELLES du tenant courant.
 * Toutes les requêtes filtrent par `organizationId` : aucune fuite inter-tenant.
 */

export type ExportKind = 'sales' | 'stock' | 'customers' | 'purchases';

const KINDS: ExportKind[] = ['sales', 'stock', 'customers', 'purchases'];

export function isExportKind(value: unknown): value is ExportKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

/** Échappe une cellule CSV (séparateur `;`, compatible Excel FR). */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(';')];
  for (const row of rows) lines.push(row.map(cell).join(';'));
  return '\uFEFF' + lines.join('\r\n'); // BOM pour Excel
}

/** Ventes (POS) de l'organisation. */
async function salesCsv(orgId: string): Promise<string> {
  const sales = await prisma.sale.findMany({
    where: { store: { organizationId: orgId } },
    include: {
      items: true,
      payments: true,
      customer: { select: { name: true } },
      store: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  return toCsv(
    ['Date', 'Boutique', 'Client', 'Statut', 'Total', 'Payé', 'Reste', 'Articles'],
    sales.map((s) => {
      const paid = s.payments.filter((p) => p.status === 'SUCCESSFUL').reduce((a, p) => a + p.amount, 0);
      return [
        s.createdAt.toISOString(),
        s.store.name,
        s.customer?.name ?? '',
        s.status,
        s.total,
        paid,
        Math.max(0, s.total - paid),
        s.items.map((i) => `${i.quantity}×${i.name}`).join(' | '),
      ];
    }),
  );
}

/** Stock courant par boutique. */
async function stockCsv(orgId: string): Promise<string> {
  const inventories = await prisma.inventory.findMany({
    where: { store: { organizationId: orgId } },
    include: { variant: { include: { product: true } }, store: { select: { name: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  return toCsv(
    ['Boutique', 'Produit', 'Variante', 'Conditionnement', 'Quantité', 'Stock bas'],
    inventories.map((inv) => {
      const threshold = inv.variant.lowStockThreshold || inv.variant.product.alertThreshold;
      return [
        inv.store.name,
        inv.variant.product.name,
        inv.variant.name,
        formatPackaging(0, inv.variant.product.packaging).replace(/^\d+\s/, ''),
        inv.quantity,
        threshold > 0 && inv.quantity <= threshold ? 'OUI' : 'NON',
      ];
    }),
  );
}

/** Clients et créances. */
async function customersCsv(orgId: string): Promise<string> {
  const customers = await prisma.customer.findMany({
    where: { organizationId: orgId },
    include: { sales: { include: { payments: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return toCsv(
    ['Client', 'Téléphone', 'Email', 'Total achats', 'Solde dû'],
    customers.map((c) => {
      const total = c.sales.reduce((s, sale) => s + sale.total, 0);
      const balance = c.sales.reduce((sum, sale) => {
        const paid = sale.payments.filter((p) => p.status === 'SUCCESSFUL').reduce((a, p) => a + p.amount, 0);
        return sum + Math.max(0, sale.total - paid);
      }, 0);
      return [c.name, c.phone ?? '', c.email ?? '', total, balance];
    }),
  );
}

/** Achats fournisseurs et dettes. */
async function purchasesCsv(orgId: string): Promise<string> {
  const purchases = await prisma.purchase.findMany({
    where: { organizationId: orgId },
    include: { payments: true, supplier: { select: { name: true } }, store: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return toCsv(
    ['Date', 'Boutique', 'Fournisseur', 'Statut', 'Total', 'Payé', 'Reste'],
    purchases.map((p) => {
      const paid = p.payments.filter((x) => x.status === 'SUCCESSFUL').reduce((a, x) => a + x.amount, 0);
      return [p.createdAt.toISOString(), p.store.name, p.supplier?.name ?? '', p.status, p.total, paid, Math.max(0, p.total - paid)];
    }),
  );
}

export async function buildExport(orgId: string, kind: ExportKind): Promise<string> {
  switch (kind) {
    case 'sales':
      return salesCsv(orgId);
    case 'stock':
      return stockCsv(orgId);
    case 'customers':
      return customersCsv(orgId);
    case 'purchases':
      return purchasesCsv(orgId);
  }
}
