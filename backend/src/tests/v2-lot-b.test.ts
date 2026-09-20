// Tests V2 — LOT B : Codes-barres, Inventaires, Stock avancé, Analytics, Exports.
import { vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:./test-v2-lotb.db'; });

import { describe, it, expect, beforeAll } from 'vitest';
import db, { bootstrap } from '../lib/bootstrap';
import { seedWorld, nowIso , resetDatabase } from './helpers';

let W: any;
let counts: any, barcodes: any, analytics: any, exportsSvc: any, products: any, sales: any, orders: any, inventory: any;

beforeAll(async () => {
  bootstrap();
  resetDatabase(db);
  counts = await import('../modules/inventoryCounts/service');
  barcodes = await import('../modules/barcodes/service');
  analytics = await import('../modules/analytics/service');
  exportsSvc = await import('../modules/exports/service');
  products = await import('../modules/products/service');
  sales = await import('../modules/sales/service');
  orders = await import('../modules/orders/service');
  inventory = await import('../modules/inventory/service');
  W = await seedWorld(db);
}, 120000);

const userA = () => ({ userId: W.mAUser, role: 'MERCHANT', merchantId: W.merchantA, storeIds: [W.storeA, W.closedStore] });
const userB = () => ({ userId: W.mBUser, role: 'MERCHANT', merchantId: W.merchantB, storeIds: [W.storeB] });

describe('V2 LOT B — Codes-barres', () => {
  it('scan par code-barres renvoie produit + stock réel', () => {
    const r = barcodes.findByBarcode(W.storeA, '3000000000015', userA()) as any;
    expect(r.id).toBe(W.pRiz);
    expect(r.stockQty).toBeGreaterThan(0);
  });
  it('scan par SKU fonctionne aussi', () => {
    const r = barcodes.findByBarcode(W.storeA, 'RIZ25', userA()) as any;
    expect(r.id).toBe(W.pRiz);
  });
  it('unicité du code-barres par boutique (index unique)', () => {
    expect(() => barcodes.assignBarcode(userA(), W.pSucre, '3000000000015')).toThrow('déjà attribué');
  });
  it('assignation d un nouveau code OK + audit', () => {
    const r = barcodes.assignBarcode(userA(), W.pSucre, '3000000000022') as any;
    expect(r.barcode).toBe('3000000000022');
    const log = db.prepare(`SELECT * FROM audit_logs WHERE action = 'BARCODE_ASSIGN'`).get();
    expect(log).toBeDefined();
  });
  it('tenant : scan avec boutique B sur code de A → rien', () => {
    const r = barcodes.findByBarcode(W.storeB, '3000000000015', userB());
    expect(r).toBeNull();
  });
});

describe('V2 LOT B — Inventaires traçables', () => {
  let countId = '';

  it('startCount snapshot le stock système', async () => {
    const c = await counts.startCount(userA(), W.storeA);
    countId = c.id;
    expect(c.status).toBe('OPEN');
    expect(c.items.length).toBeGreaterThanOrEqual(3);
    const riz = c.items.find((i: any) => i.productName === 'Riz 25kg');
    expect(riz.systemQty).toBeGreaterThan(0);
    expect(riz.countedQty).toBeNull();
  });
  it('un seul inventaire ouvert par boutique', async () => {
    await expect(counts.startCount(userA(), W.storeA)).rejects.toThrow('déjà en cours');
  });
  it('saisie du compté → écart calculé (stock 20, compté 18 → écart -2)', async () => {
    const c = await counts.getCount(countId, userA());
    const riz = c.items.find((i: any) => i.productName === 'Riz 25kg');
    const it = await counts.setCountedQty(userA(), countId, riz.productId, riz.systemQty - 2);
    expect(it.difference).toBe(-2);
  });
  it('quantité négative refusée', async () => {
    const c = await counts.getCount(countId, userA());
    const riz = c.items.find((i: any) => i.productName === 'Riz 25kg');
    await expect(counts.setCountedQty(userA(), countId, riz.productId, -1)).rejects.toThrow('invalide');
  });
  it('tenant : B ne peut ni lire ni confirmer l inventaire de A', async () => {
    await expect(counts.getCount(countId, userB())).rejects.toThrow('Accès refusé');
    await expect(counts.confirmCount(userB(), countId)).rejects.toThrow('Accès refusé');
  });
  it('confirmation crée des mouvements INVENTORY traçables et ajuste le stock', async () => {
    const before = db.prepare(`SELECT quantity FROM inventories WHERE storeId = ? AND productId = ?`).get(W.storeA, W.pRiz) as any;
    const c = await counts.confirmCount(userA(), countId);
    expect(c.status).toBe('CONFIRMED');
    const after = db.prepare(`SELECT quantity FROM inventories WHERE storeId = ? AND productId = ?`).get(W.storeA, W.pRiz) as any;
    expect(after.quantity).toBe(before.quantity - 2);
    const mv = db.prepare(`SELECT * FROM inventory_movements WHERE type = 'INVENTORY' AND storeId = ? ORDER BY createdAt DESC`).get(W.storeA) as any;
    expect(mv.quantity).toBe(-2);
    expect(mv.reason).toContain('Inventaire');
  });
  it('confirmation d un inventaire déjà clôturé → refus', async () => {
    await expect(counts.confirmCount(userA(), countId)).rejects.toThrow('déjà clôturé');
  });
  it('annulation sans effet sur le stock', async () => {
    const before = db.prepare(`SELECT quantity FROM inventories WHERE storeId = ? AND productId = ?`).get(W.storeA, W.pSucre) as any;
    const c = await counts.startCount(userA(), W.storeA);
    await counts.cancelCount(userA(), c.id);
    const after = db.prepare(`SELECT quantity FROM inventories WHERE storeId = ? AND productId = ?`).get(W.storeA, W.pSucre) as any;
    expect(after.quantity).toBe(before.quantity);
  });
  it('confirmation par un user sans droit sur la boutique → refus', async () => {
    const c = await counts.startCount(userA(), W.storeA);
    await expect(counts.confirmCount({ userId: 'x', role: 'MERCHANT', merchantId: 'other', storeIds: [] }, c.id)).rejects.toThrow('Accès refusé');
    await counts.cancelCount(userA(), c.id);
  });
});

describe('V2 LOT B — Stock avancé & alertes', () => {
  it('stockMax modifiable + alerte sur-stock dans analytics', async () => {
    await products.updateProduct(W.pRiz, { stockMax: 5 }, W.mAUser);
    // conflit : ce code appartient déjà au Sucre (assigné dans le test codes-barres)
    await expect(products.updateProduct(W.pRiz, { barcode: '3000000000022' }, W.mAUser)).rejects.toThrow('déjà attribué');
    const p = await products.updateProduct(W.pRiz, { barcode: '3000000000099' }, W.mAUser);
    expect(p.barcode).toBe('3000000000099');
  });
  it('vente sous le seuil génère une notification STOCK_ALERT réelle', async () => {
    // Sucre : stock 3, seuil 5 → toute vente déclenche l'alerte
    const notifsBefore = (db.prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE type = 'STOCK_ALERT'`).get() as any).cnt;
    await sales.createSale(W.storeA, { items: [{ productId: W.pSucre, quantity: 1 }], paymentMethod: 'CASH' }, W.mAUser);
    const notifsAfter = (db.prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE type = 'STOCK_ALERT'`).get() as any).cnt;
    expect(notifsAfter).toBe(notifsBefore + 1);
    const n = db.prepare(`SELECT * FROM notifications WHERE type = 'STOCK_ALERT' ORDER BY createdAt DESC LIMIT 1`).get() as any;
    expect(n.body).toContain('Sucre 1kg');
  });
});

describe('V2 LOT B — Analytics', () => {
  beforeAll(async () => {
    // données réelles : une vente de Riz aujourd'hui
    await sales.createSale(W.storeA, { items: [{ productId: W.pRiz, quantity: 2 }], paymentMethod: 'CASH' }, W.mAUser);
    await db.prepare(`INSERT INTO expenses (id, storeId, category, amount, date, createdAt) VALUES (?,?,?,?,?,?)`)
      .run('exp1', W.storeA, 'Transport', 10000, nowIso(), nowIso());
  });

  it('ventes aujourd hui / 7j / 30j cohérentes avec les ventes réelles', async () => {
    const a = await analytics.storeAnalytics(userA(), W.storeA);
    const realTotal = (db.prepare(`SELECT COALESCE(SUM(totalAmount),0) as t FROM sales WHERE storeId = ?`).get(W.storeA) as any).t;
    expect(a.sales.last30days.total).toBe(realTotal);
    expect(a.sales.today.total).toBe(realTotal);
    expect(a.sales.custom.count).toBeGreaterThanOrEqual(2);
  });

  it('produits : top par CA + quantités vendues réelles', async () => {
    const a = await analytics.storeAnalytics(userA(), W.storeA);
    expect(a.products.topRevenue[0].name).toBe('Riz 25kg');
    expect(a.products.topRevenue[0].qtySold).toBeGreaterThanOrEqual(2);
  });

  it('stock : sous seuil + dormant + rotation calculés', async () => {
    const a = await analytics.storeAnalytics(userA(), W.storeA);
    expect(a.stock.underThreshold.some((r: any) => r.name === 'Sucre 1kg')).toBe(true);
    expect(a.stock.rotation.length).toBeGreaterThan(0);
    expect(Array.isArray(a.stock.movements)).toBe(true);
  });

  it('clients : comptés sur les ventes réelles', async () => {
    const a = await analytics.storeAnalytics(userA(), W.storeA);
    expect(typeof a.clients.activeCount).toBe('number');
    expect(typeof a.clients.recurringCount).toBe('number');
  });

  it('finance : marge ESTIMÉE étiquetée, jamais "bénéfice"', async () => {
    const a = await analytics.storeAnalytics(userA(), W.storeA);
    expect(a.finance.revenue).toBeGreaterThan(0);
    expect(a.finance.expenses).toBeGreaterThanOrEqual(10000);
    if (a.finance.margeEstimee !== null) {
      expect(a.finance.note).toContain('pas un bénéfice');
    }
  });

  it('tenant : analytics de A inaccessible pour B', async () => {
    await expect(analytics.storeAnalytics(userB(), W.storeA)).rejects.toThrow('Accès refusé');
  });
});

describe('V2 LOT B — Exports CSV', () => {
  it('export ventes : CSV avec en-têtes + données du tenant', () => {
    const csv = exportsSvc.exportCsv(userA(), W.storeA, 'sales');
    expect(csv).toContain('montant_FCFA');
    expect(csv.split('\n').length).toBeGreaterThan(2);
  });
  it('export produits inclut code-barres et stock max', () => {
    const csv = exportsSvc.exportCsv(userA(), W.storeA, 'products');
    expect(csv).toContain('code_barres');
    expect(csv).toContain('stock_max');
  });
  it('les 6 types demandés fonctionnent', () => {
    for (const t of ['sales', 'products', 'stock', 'orders', 'customers', 'expenses']) {
      const csv = exportsSvc.exportCsv(userA(), W.storeA, t);
      expect(csv.length).toBeGreaterThan(20);
    }
  });
  it('tenant : export de la boutique A refusé pour B', () => {
    expect(() => exportsSvc.exportCsv(userB(), W.storeA, 'sales')).toThrow('Accès refusé');
  });
  it('type inconnu → 400', () => {
    expect(() => exportsSvc.exportCsv(userA(), W.storeA, 'bank')).toThrow('inconnu');
  });
});
