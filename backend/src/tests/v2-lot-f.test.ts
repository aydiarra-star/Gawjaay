// Tests V2 — LOT F : Assistant IA strict no-invention + actions contrôlées.
import { vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL = 'file:./test-v2-lotf.db'; });

import { describe, it, expect, beforeAll } from 'vitest';
import db, { bootstrap } from '../lib/bootstrap';
import { seedWorld } from './helpers';

let W: any;
let assistant: any, sales: any;

beforeAll(async () => {
  bootstrap();
  db.exec(`PRAGMA foreign_keys = OFF;
    DELETE FROM sessions; DELETE FROM audit_logs; DELETE FROM notifications; DELETE FROM employees;
    DELETE FROM ai_messages; DELETE FROM ai_conversations; DELETE FROM ai_action_requests;
    DELETE FROM delivery_proofs; DELETE FROM deliveries;
    DELETE FROM payments; DELETE FROM debt_payments; DELETE FROM debts;
    DELETE FROM order_items; DELETE FROM orders; DELETE FROM sale_items; DELETE FROM sales;
    DELETE FROM b2b_order_items; DELETE FROM b2b_orders; DELETE FROM b2b_catalog_items; DELETE FROM b2b_catalogs;
    DELETE FROM b2b_profiles; DELETE FROM replenishment_suggestions;
    DELETE FROM loyalty_transactions; DELETE FROM loyalty_accounts; DELETE FROM favorites;
    DELETE FROM coupon_redemptions; DELETE FROM coupons; DELETE FROM promotion_products; DELETE FROM promotions;
    DELETE FROM review_reports; DELETE FROM moderation_actions; DELETE FROM reviews;
    DELETE FROM inventory_count_items; DELETE FROM inventory_counts;
    DELETE FROM purchase_items; DELETE FROM purchases; DELETE FROM expenses;
    DELETE FROM inventory_movements; DELETE FROM inventories; DELETE FROM products;
    DELETE FROM drivers; DELETE FROM stores; DELETE FROM merchants; DELETE FROM users; DELETE FROM categories;
    PRAGMA foreign_keys = ON;`);
  assistant = await import('../modules/assistant/service');
  sales = await import('../modules/sales/service');
  W = await seedWorld(db);
  // données réelles : 2 ventes Riz (2 × 15000 = 30000) + 1 vente Sucre (800)
  await sales.createSale(W.storeA, { items: [{ productId: W.pRiz, quantity: 2 }], paymentMethod: 'CASH' }, W.mAUser);
  await sales.createSale(W.storeA, { items: [{ productId: W.pSucre, quantity: 1 }], paymentMethod: 'CASH' }, W.mAUser);
}, 120000);

const userA = () => ({ userId: W.mAUser, role: 'MERCHANT', merchantId: W.merchantA, storeIds: [W.storeA, W.closedStore] });
const userB = () => ({ userId: W.mBUser, role: 'MERCHANT', merchantId: W.merchantB, storeIds: [W.storeB] });
const client = () => ({ userId: W.clientUser, role: 'CLIENT', merchantId: null, storeIds: [] });

describe('V2 LOT F — Moteur d intentions (strict no-invention)', () => {
  it('ventes : chiffres 100 % réels (30000 + 800 = 30800 sur 30 j)', async () => {
    const r = await assistant.ask(userA(), W.storeA, 'Quel est mon chiffre d affaires ?');
    expect(r.intent).toBe('SALES');
    expect(r.data.sales.last30days.total).toBe(30800);
    expect(r.content).toMatch(/30.?800/); // espace de groupement fr (U+202F)
    expect(r.disclaimer).toContain('données réelles');
  });

  it('aujourd hui sans vente → « Je ne dispose pas » honnête (rien inventé)', async () => {
    // toutes les ventes viennent d'être créées "aujourd'hui" → ce test vérifie la question stock vide plutôt :
    const r = await assistant.ask(userB(), W.storeB, 'Combien de ventes aujourd hui ?');
    expect(r.intent).toBe('SALES');
    expect(r.content).toContain('Je ne dispose pas');
  });

  it('stock : produits sous seuil listés depuis les données réelles (Sucre 3/5)', async () => {
    const r = await assistant.ask(userA(), W.storeA, 'Quels produits sont en rupture de stock ?');
    expect(r.intent).toBe('STOCK');
    expect(r.data.underThreshold.some((p: any) => p.name === 'Sucre 1kg')).toBe(true);
    expect(r.content).toContain('Sucre 1kg');
  });

  it('top produits : Riz premier par chiffre d affaires', async () => {
    const r = await assistant.ask(userA(), W.storeA, 'Quel est mon top produit ?');
    expect(r.intent).toBe('TOP_PRODUCTS');
    expect(r.data.top[0].name).toBe('Riz 25kg');
    expect(r.data.top[0].revenue).toBe(30000);
  });

  it('clients : panier moyen calculé, jamais inventé', async () => {
    const r = await assistant.ask(userA(), W.storeA, 'Combien de clients actifs ?');
    expect(r.intent).toBe('CLIENTS');
    expect(r.data.activeCount).toBe(0); // ventes POS sans client rattaché
    expect(r.content).toContain('Je ne dispose pas');
  });

  it('finance : marge null quand aucun prix d achat (pas d estimation inventée)', async () => {
    const r = await assistant.ask(userA(), W.storeA, 'Quelles sont mes dépenses et ma marge ?');
    expect(r.intent).toBe('FINANCE');
    expect(r.data.margeEstimee).toBeNull();
    expect(r.content).toMatch(/je ne l.invente pas/);
  });

  it('question hors périmètre → refus honnête + capacités', async () => {
    const r = await assistant.ask(userA(), W.storeA, 'Quel temps fera-t-il demain ?');
    expect(r.intent).toBe('UNKNOWN');
    expect(r.content).toContain('Je ne dispose pas');
    expect(r.content).toContain('Ventes');
  });

  it('fidélité inactif → réponse honnête (pas activé)', async () => {
    const r = await assistant.ask(userA(), W.storeA, 'Où en est la fidélité ?');
    expect(r.intent).toBe('LOYALTY');
    expect(r.content).toMatch(/pas activé/);
  });

  it('les messages USER et ASSISTANT sont persistés (conversation auto)', async () => {
    const conv = db.prepare('SELECT * FROM ai_conversations WHERE userId = ? AND storeId = ?').get(W.mAUser, W.storeA) as any;
    expect(conv).toBeDefined();
    const msgs = db.prepare('SELECT * FROM ai_messages WHERE conversationId = ? ORDER BY createdAt').all(conv.id) as any[];
    expect(msgs.length).toBeGreaterThanOrEqual(6);
    expect(msgs.filter((m) => m.role === 'USER').length).toBeGreaterThanOrEqual(3);
    expect(msgs.filter((m) => m.role === 'ASSISTANT').every((m) => m.intent)).toBe(true);
  });

  it('history : renvoie la conversation du demandeur', async () => {
    const h = assistant.history(userA(), W.storeA);
    expect(h.length).toBeGreaterThanOrEqual(6);
    expect(h[0].role).toBe('USER');
  });

  it('tenant : marchand B interdit sur la boutique A (ask + history + actions)', async () => {
    await expect(assistant.ask(userB(), W.storeA, 'mes ventes ?')).rejects.toThrow('Accès refusé');
    expect(() => assistant.history(userB(), W.storeA)).toThrow('Accès refusé');
    expect(() => assistant.listActions(userB(), W.storeA)).toThrow('Accès refusé');
  });

  it('CLIENT interdit', async () => {
    await expect(assistant.ask(client(), W.storeA, 'ventes')).rejects.toThrow();
  });

  it('question vide → 400', async () => {
    await expect(assistant.ask(userA(), W.storeA, '   ')).rejects.toThrow('Question vide');
  });
});

describe('V2 LOT F — Actions contrôlées (whitelist + confirmation explicite)', () => {
  it('action hors whitelist → 400', async () => {
    expect(() => assistant.requestAction(userA(), W.storeA, 'DELETE_ALL_PRODUCTS', {})).toThrow('non autorisée');
  });

  it('GENERATE_REPLENISHMENT_PLAN : PENDING sans exécution tant que non confirmé', async () => {
    const req = await assistant.requestAction(userA(), W.storeA, 'GENERATE_REPLENISHMENT_PLAN', {});
    expect(req.status).toBe('PENDING');
    expect(req.expiresAt).toBeTruthy();
    // rien n'a été exécuté
    const count = (db.prepare(`SELECT COUNT(*) as c FROM replenishment_suggestions WHERE storeId = ?`).get(W.storeA) as any).c;
    expect(count).toBe(0);
    (global as any).__reqId = req.id;
  });

  it('confirmation → EXECUTED, suggestions persistées (Sucre), audit AI_ACTION', async () => {
    const r = await assistant.confirmAction(userA(), (global as any).__reqId, true);
    expect(r.status).toBe('EXECUTED');
    expect(r.result.suggestionsCreated).toBeGreaterThanOrEqual(1);
    const sug = db.prepare(`SELECT * FROM replenishment_suggestions WHERE storeId = ? AND status = 'OPEN'`).get(W.storeA) as any;
    expect(sug).toBeDefined();
    expect(sug.currentStock).toBeLessThanOrEqual(sug.threshold);
    const audit = db.prepare(`SELECT * FROM audit_logs WHERE action = 'AI_ACTION' AND resourceId = ?`).get((global as any).__reqId) as any;
    expect(audit).toBeDefined();
  });

  it('re-exécution idempotente : pas de doublon de suggestion OPEN', async () => {
    const req = await assistant.requestAction(userA(), W.storeA, 'GENERATE_REPLENISHMENT_PLAN', {});
    const r = await assistant.confirmAction(userA(), req.id, true);
    expect(r.result.suggestionsCreated).toBe(0); // déjà OPEN → rien de nouveau
  });

  it('rejet → REJECTED, rien n est exécuté', async () => {
    db.prepare(`DELETE FROM replenishment_suggestions WHERE storeId = ?`).run(W.storeA);
    const req = await assistant.requestAction(userA(), W.storeA, 'GENERATE_REPLENISHMENT_PLAN', {});
    const r = await assistant.confirmAction(userA(), req.id, false);
    expect(r.status).toBe('REJECTED');
    const count = (db.prepare(`SELECT COUNT(*) as c FROM replenishment_suggestions WHERE storeId = ?`).get(W.storeA) as any).c;
    expect(count).toBe(0);
  });

  it('double confirmation → 400 (déjà traitée)', async () => {
    const req = await assistant.requestAction(userA(), W.storeA, 'SEND_LOW_STOCK_ALERT', {});
    await assistant.confirmAction(userA(), req.id, true);
    await expect(assistant.confirmAction(userA(), req.id, true)).rejects.toThrow('déjà traitée');
    const n = db.prepare(`SELECT * FROM notifications WHERE userId = ? AND type = 'STOCK_ALERT'`).get(W.mAUser) as any;
    expect(n).toBeDefined();
  });

  it('expiration : demande PENDING expirée → EXPIRED, non exécutable', async () => {
    const req = await assistant.requestAction(userA(), W.storeA, 'GENERATE_REPLENISHMENT_PLAN', {});
    db.prepare(`UPDATE ai_action_requests SET expiresAt = ? WHERE id = ?`).run(new Date(Date.now() - 1000).toISOString(), req.id);
    await expect(assistant.confirmAction(userA(), req.id, true)).rejects.toThrow('déjà traitée');
    const row = db.prepare('SELECT status FROM ai_action_requests WHERE id = ?').get(req.id) as any;
    expect(row.status).toBe('EXPIRED');
  });

  it('liste des demandes d action de la boutique', async () => {
    const list = assistant.listActions(userA(), W.storeA);
    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(list.every((x: any) => x.storeId === W.storeA)).toBe(true);
  });
});
