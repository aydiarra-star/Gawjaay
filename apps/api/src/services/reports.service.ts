import type { Tx } from '../lib/prisma.js';
import { prisma } from '../lib/prisma.js';

export interface DateRange {
  from: Date;
  to: Date;
}

/** Résout une plage de dates à partir d'un libellé (aujourd'hui, 7j, 30j, mois, personnalisé). */
export function resolveRange(params: { range?: string; from?: string; to?: string }): DateRange {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  switch (params.range) {
    case 'today':
      return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: end };
    case '7d':
      return { from: new Date(Date.now() - 7 * 864e5), to: end };
    case '30d':
      return { from: new Date(Date.now() - 30 * 864e5), to: end };
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: end };
    case 'custom': {
      const from = params.from ? new Date(params.from) : new Date(Date.now() - 30 * 864e5);
      const to = params.to ? new Date(`${params.to}T23:59:59.999`) : end;
      return { from, to };
    }
    default:
      return { from: new Date(Date.now() - 30 * 864e5), to: end };
  }
}

/**
 * Tableau de bord : tous les indicateurs sont calculés À PARTIR DE LA BASE (cahier §28, §29).
 * Aucun chiffre décoratif. `storeId` optionnel pour restreindre à une boutique de l'organisation.
 */
export async function dashboard(orgId: string, range: DateRange, storeId?: string) {
  const storeFilter = storeId ? { storeId } : {};
  const saleWhere = { store: { organizationId: orgId }, createdAt: { gte: range.from, lte: range.to }, ...storeFilter };

  const [sales, orders, products, lowStock, customers, purchases, debts] = await Promise.all([
    prisma.sale.findMany({
      where: saleWhere,
      include: {
        payments: true,
        items: { include: { variant: { include: { product: { select: { purchasePrice: true } } } } } },
      },
    }),
    prisma.order.findMany({ where: { organizationId: orgId, createdAt: { gte: range.from, lte: range.to }, ...storeFilter } }),
    prisma.product.count({ where: { organizationId: orgId, isActive: true } }),
    lowStockProducts(orgId, storeId),
    prisma.customer.count({ where: { organizationId: orgId } }),
    prisma.purchase.findMany({ where: { organizationId: orgId, status: 'RECEIVED', receivedAt: { gte: range.from, lte: range.to } } }),
    receivablesSummary(orgId),
  ]);

  const revenue = sales.reduce((sum, s) => sum + s.total, 0);
  const salesCount = sales.length;
  const averageBasket = salesCount > 0 ? Math.round(revenue / salesCount) : 0;

  // Bénéfice estimé : (prix de vente - prix d'achat) sur les articles vendus.
  // On privilégie le coût FIGÉ au moment de la vente (SaleItem.unitCost) ; les
  // ventes antérieures à ce champ retombent sur le prix d'achat produit actuel.
  let grossMargin = 0;
  for (const sale of sales) {
    for (const item of sale.items) {
      const cost = item.unitCost ?? item.variant.product.purchasePrice ?? 0;
      grossMargin += item.lineTotal - cost * item.quantity;
    }
  }

  const ordersByStatus = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});

  const purchaseTotal = purchases.reduce((sum, p) => sum + p.total, 0);

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    revenue,
    salesCount,
    averageBasket,
    grossMargin,
    ordersCount: orders.length,
    ordersByStatus,
    productsCount: products,
    lowStockCount: lowStock.length,
    lowStock: lowStock.slice(0, 10),
    customersCount: customers,
    purchasesTotal: purchaseTotal,
    receivables: debts.receivables,
    payables: debts.payables,
  };
}

/** Produits dont le stock est <= seuil d'alerte (cahier §29). */
export async function lowStockProducts(orgId: string, storeId?: string) {
  const inventories = await prisma.inventory.findMany({
    where: { store: { organizationId: orgId, ...(storeId ? { id: storeId } : {}) } },
    include: { variant: { include: { product: true } }, store: { select: { id: true, name: true } } },
  });
  return inventories
    .filter((inv) => {
      const threshold = inv.variant.lowStockThreshold || inv.variant.product.alertThreshold;
      return threshold > 0 && inv.quantity <= threshold;
    })
    .map((inv) => ({
      storeId: inv.storeId,
      storeName: inv.store.name,
      variantId: inv.variantId,
      productName: inv.variant.product.name,
      variantName: inv.variant.name,
      packaging: inv.variant.product.packaging,
      quantity: inv.quantity,
      threshold: inv.variant.lowStockThreshold || inv.variant.product.alertThreshold,
    }))
    .sort((a, b) => a.quantity - b.quantity);
}

/** Créances clients (reste dû) et dettes fournisseurs, calculées réellement. */
export async function receivablesSummary(orgId: string) {
  const sales = await prisma.sale.findMany({
    where: { store: { organizationId: orgId } },
    include: { payments: true, customer: true },
  });
  let receivables = 0;
  for (const sale of sales) {
    const paid = sale.payments.filter((p) => p.status === 'SUCCESSFUL').reduce((s, p) => s + p.amount, 0);
    receivables += Math.max(0, sale.total - paid);
  }

  const purchases = await prisma.purchase.findMany({
    where: { organizationId: orgId, status: 'RECEIVED' },
    include: { payments: true },
  });
  let payables = 0;
  for (const purchase of purchases) {
    const paid = purchase.payments.filter((p) => p.status === 'SUCCESSFUL').reduce((s, p) => s + p.amount, 0);
    payables += Math.max(0, purchase.total - paid);
  }

  return { receivables, payables };
}

/** Séries pour statistiques : CA par jour, top produits. */
export async function salesStats(orgId: string, range: DateRange, storeId?: string) {
  const sales = await prisma.sale.findMany({
    where: { store: { organizationId: orgId }, createdAt: { gte: range.from, lte: range.to }, ...(storeId ? { storeId } : {}) },
    include: { items: true },
  });

  const byDay = new Map<string, { revenue: number; count: number }>();
  const byProduct = new Map<string, { name: string; quantity: number; revenue: number }>();

  for (const sale of sales) {
    const day = sale.createdAt.toISOString().slice(0, 10);
    const d = byDay.get(day) ?? { revenue: 0, count: 0 };
    d.revenue += sale.total;
    d.count += 1;
    byDay.set(day, d);
    for (const item of sale.items) {
      const p = byProduct.get(item.variantId) ?? { name: item.name, quantity: 0, revenue: 0 };
      p.quantity += item.quantity;
      p.revenue += item.lineTotal;
      byProduct.set(item.variantId, p);
    }
  }

  return {
    daily: [...byDay.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
    topProducts: [...byProduct.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    totals: {
      revenue: sales.reduce((s, x) => s + x.total, 0),
      count: sales.length,
    },
  };
}

export type { Tx };
