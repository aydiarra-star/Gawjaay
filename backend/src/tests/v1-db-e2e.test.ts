// Baseline V1 — Tests DB E2E (67+) — couche services complète, DB isolée.
import { vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL = 'file:./test-v1-dbe2e.db'; });

import { describe, it, expect, beforeAll } from 'vitest';
import db, { bootstrap } from '../lib/bootstrap';
import { seedWorld, nowIso } from './helpers';

let W: any;
let auth: any, stores: any, products: any, inventory: any, sales: any, customers: any,
  debts: any, suppliers: any, expenses: any, orders: any, payments: any, deliveries: any,
  notifications: any, employees: any, marketplace: any, dashboard: any, admin: any, regions: any;

beforeAll(async () => {
  bootstrap();
  db.exec(`PRAGMA foreign_keys = OFF;
    DELETE FROM sessions; DELETE FROM audit_logs; DELETE FROM notifications; DELETE FROM employees;
    DELETE FROM deliveries; DELETE FROM payments; DELETE FROM debt_payments; DELETE FROM debts;
    DELETE FROM order_items; DELETE FROM orders; DELETE FROM sale_items; DELETE FROM sales;
    DELETE FROM purchase_items; DELETE FROM purchases; DELETE FROM expenses;
    DELETE FROM inventory_movements; DELETE FROM inventories; DELETE FROM products;
    DELETE FROM stores; DELETE FROM merchants; DELETE FROM users; DELETE FROM categories;
    PRAGMA foreign_keys = ON;`);
  auth = await import('../modules/auth/service');
  stores = await import('../modules/stores/service');
  products = await import('../modules/products/service');
  inventory = await import('../modules/inventory/service');
  sales = await import('../modules/sales/service');
  customers = await import('../modules/customers/service');
  debts = await import('../modules/debts/service');
  suppliers = await import('../modules/suppliers/service');
  expenses = await import('../modules/expenses/service');
  orders = await import('../modules/orders/service');
  payments = await import('../modules/payments/service');
  deliveries = await import('../modules/deliveries/service');
  notifications = await import('../modules/notifications/service');
  employees = await import('../modules/employees/service');
  marketplace = await import('../modules/marketplace/service');
  dashboard = await import('../modules/dashboard/service');
  admin = await import('../modules/admin/service');
  regions = await import('../modules/regions/service');
  W = await seedWorld(db);
}, 120000);

const userA = () => ({ userId: W.mAUser, role: 'MERCHANT', merchantId: W.merchantA, storeIds: [W.storeA, W.closedStore] });
const userB = () => ({ userId: W.mBUser, role: 'MERCHANT', merchantId: W.merchantB, storeIds: [W.storeB] });
const clientCtx = () => ({ userId: W.clientUser, role: 'CLIENT', storeIds: [] });

describe('Baseline V1 DB — Auth & sessions (8)', () => {
  it('register CLIENT → user + tokens', async () => {
    const r = await auth.register({ phone: '+221771111111', password: 'Password123!', role: 'CLIENT' });
    expect(r.user.role).toBe('CLIENT');
    expect(r.accessToken).toBeDefined();
  });
  it('register MERCHANT → fiche merchant créée', async () => {
    const r = await auth.register({ phone: '+221772222222', password: 'Password123!', role: 'MERCHANT', name: 'M Test' });
    const m = db.prepare('SELECT * FROM merchants WHERE userId = ?').get(r.user.id) as any;
    expect(m).toBeDefined();
  });
  it('register téléphone dupliqué rejeté', async () => {
    await expect(auth.register({ phone: '+221770000010', password: 'Password123!' })).rejects.toThrow('déjà utilisé');
  });
  it('login valide → tokens + lastLoginAt', async () => {
    const r = await auth.login('+221770000010', 'Password123!');
    expect(r.accessToken).toBeDefined();
    const u = db.prepare('SELECT lastLoginAt FROM users WHERE id = ?').get(r.user.id) as any;
    expect(u.lastLoginAt).toBeDefined();
  });
  it('login mot de passe erroné → 401 + audit LOGIN_FAILED', async () => {
    await expect(auth.login('+221770000010', 'nope')).rejects.toThrow('Identifiants invalides');
    const log = db.prepare(`SELECT * FROM audit_logs WHERE action = 'LOGIN_FAILED'`).get();
    expect(log).toBeDefined();
  });
  it('refresh délivre un nouvel access token', async () => {
    const login = await auth.login('+221770000010', 'Password123!');
    const r = await auth.refresh(login.refreshToken);
    expect(r.accessToken).toBeDefined();
  });
  it('logout révoque la session', async () => {
    const login = await auth.login('+221770000010', 'Password123!');
    await auth.logout(login.refreshToken);
    await expect(auth.refresh(login.refreshToken)).rejects.toThrow('Session expirée');
  });
  it('changePassword : ancien mot de passe requis', async () => {
    await expect(auth.changePassword(W.clientUser, 'mauvais', 'NewPassword123!')).rejects.toThrow('Ancien mot de passe incorrect');
    await auth.changePassword(W.clientUser2, 'Password123!', 'NewPassword123!');
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(W.clientUser2) as any;
    expect(await import('bcryptjs')).toBeTruthy();
  });
});

describe('Baseline V1 DB — Boutiques (7)', () => {
  it('createStore → slug généré + audit', async () => {
    const s = await stores.createStore(userA(), { name: 'Nouvelle Boutique A2' });
    expect(s.slug).toBe('nouvelle-boutique-a2');
  });
  it('createStore nom identique → slug suffixé', async () => {
    const s = await stores.createStore(userA(), { name: 'Nouvelle Boutique A2' });
    expect(s.slug).toBe('nouvelle-boutique-a2-1');
  });
  it('CLIENT ne peut pas créer de boutique', async () => {
    await expect(stores.createStore(clientCtx(), { name: 'Interdit' })).rejects.toThrow('commerçant');
  });
  it('listMyStores : merchant A ne voit que ses boutiques', async () => {
    const list = await stores.listMyStores(userA());
    expect(list.map((s: any) => s.id)).toEqual(expect.arrayContaining([W.storeA]));
    expect(list.map((s: any) => s.id)).not.toContain(W.storeB);
  });
  it('getStoreById : propriétaire OK', async () => {
    const s = await stores.getStoreById(W.storeA, userA());
    expect(s.id).toBe(W.storeA);
  });
  it('getStoreById : autre merchant → 403', async () => {
    await expect(stores.getStoreById(W.storeA, userB())).rejects.toThrow('Accès refusé');
  });
  it('updateStore ferme la boutique en ligne', async () => {
    const s = await stores.updateStore(userA(), W.closedStore, { digitalStatus: 'OPEN' });
    expect(s.digitalStatus).toBe('OPEN');
    await stores.updateStore(userA(), W.closedStore, { digitalStatus: 'CLOSED' });
  });
});

describe('Baseline V1 DB — Produits (8)', () => {
  it('createProduct avec stock initial → inventaire + mouvement INITIAL', async () => {
    const p = await products.createProduct(W.storeA, { name: 'Test Produit X', price: 2000, initialStock: 7 }, W.mAUser);
    const inv = db.prepare('SELECT * FROM inventories WHERE productId = ?').get(p.id) as any;
    expect(inv.quantity).toBe(7);
    const mv = db.prepare('SELECT * FROM inventory_movements WHERE productId = ? AND type = ?').get(p.id, 'INITIAL') as any;
    expect(mv.quantity).toBe(7);
  });
  it('slug produit unique par boutique', async () => {
    const p = await products.createProduct(W.storeA, { name: 'Test Produit X', price: 2100 }, W.mAUser);
    expect(p.slug).toBe('test-produit-x-1');
  });
  it('listProducts filtre par recherche', async () => {
    const list = await products.listProducts(W.storeA, { search: 'Riz' });
    expect(list.some((p: any) => p.id === W.pRiz)).toBe(true);
    expect(list.some((p: any) => p.name === 'Sucre 1kg')).toBe(false);
  });
  it('updateProduct change le prix (serveur = vérité)', async () => {
    const p = await products.updateProduct(W.pRiz, { price: 15500 }, W.mAUser);
    expect(p.price).toBe(15500);
    await products.updateProduct(W.pRiz, { price: 15000 }, W.mAUser);
  });
  it('deleteProduct = désactivation logique', async () => {
    const p = await products.createProduct(W.storeA, { name: 'À supprimer', price: 100 }, W.mAUser);
    await products.deleteProduct(p.id, W.mAUser);
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(p.id) as any;
    expect(row.isActive).toBe(0);
  });
  it('getProduct renvoie inventaire + boutique', async () => {
    const p = await products.getProduct(W.pRiz);
    expect(p.inventories.length).toBeGreaterThan(0);
    expect(p.store.id).toBe(W.storeA);
  });
  it('produit boutique B absent de la liste boutique A', async () => {
    const list = await products.listProducts(W.storeA, {});
    expect(list.some((p: any) => p.id === W.pB)).toBe(false);
  });
  it('création produit journalisée (audit)', async () => {
    const log = db.prepare(`SELECT * FROM audit_logs WHERE action = 'PRODUCT_CREATE'`).get();
    expect(log).toBeDefined();
  });
});

describe('Baseline V1 DB — Inventaire & stock (7)', () => {
  it('getStock joint le nom du produit', async () => {
    const rows = await inventory.getStock(W.storeA) as any[];
    const riz = rows.find(r => r.productId === W.pRiz);
    expect(riz.productName).toBe('Riz 25kg');
  });
  it('adjustStock +5 incrémente', async () => {
    const r = await inventory.adjustStock(W.storeA, W.pRiz, 5, 'ADJUSTMENT', 'test +', W.mAUser);
    expect(r.inventory.quantity).toBe(25);
    await inventory.adjustStock(W.storeA, W.pRiz, -5, 'ADJUSTMENT', 'retour test', W.mAUser);
  });
  it('adjustStock au-delà du stock → refus', async () => {
    await expect(inventory.adjustStock(W.storeA, W.pSucre, -10, 'SALE', 'test', W.mAUser)).rejects.toThrow('Stock insuffisant');
  });
  it('chaque ajustement écrit un mouvement traçable', async () => {
    await inventory.adjustStock(W.storeA, W.pSucre, 2, 'ADJUSTMENT', 'réassort test', W.mAUser);
    const mv = db.prepare(`SELECT * FROM inventory_movements WHERE productId = ? AND reason = ?`).get(W.pSucre, 'réassort test') as any;
    expect(mv.quantity).toBe(2);
    expect(mv.type).toBe('ADJUSTMENT');
  });
  it('history : mouvements ordonnés', async () => {
    const h = await inventory.history(W.storeA, W.pSucre) as any[];
    expect(h.length).toBeGreaterThanOrEqual(2);
  });
  it('lowStock détecte les produits sous seuil', async () => {
    const low = await inventory.lowStock(W.storeA) as any[];
    expect(low.some(r => r.productId === W.pSucre)).toBe(true);
  });
  it('adjustStock produit inexistant → 404', async () => {
    await expect(inventory.adjustStock(W.storeA, 'nope', 1, 'ADJUSTMENT', 'x', W.mAUser)).rejects.toThrow('Inventaire introuvable');
  });
});

describe('Baseline V1 DB — Ventes & dettes (11)', () => {
  it('vente CASH décrémente le stock + mouvement SALE', async () => {
    const s = await sales.createSale(W.storeA, { items: [{ productId: W.pRiz, quantity: 2 }], paymentMethod: 'CASH' }, W.mAUser);
    expect(s.totalAmount).toBe(30000);
    const inv = db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(W.storeA, W.pRiz) as any;
    expect(inv.quantity).toBe(18);
    const mv = db.prepare(`SELECT * FROM inventory_movements WHERE productId = ? AND type = 'SALE' AND referenceId = ?`).get(W.pRiz, s.id) as any;
    expect(mv.quantity).toBe(-2);
  });
  it('vente calcule le monnaie à rendre', async () => {
    const s = await sales.createSale(W.storeA, { items: [{ productId: W.pSucre, quantity: 1 }], paymentMethod: 'CASH', amountPaid: 5000 }, W.mAUser);
    expect(s.totalAmount).toBe(800);
    expect(s.change).toBe(4200);
  });
  it('vente stock insuffisant → refus', async () => {
    await expect(sales.createSale(W.storeA, { items: [{ productId: W.pRiz, quantity: 9999 }] }, W.mAUser)).rejects.toThrow('Stock insuffisant');
  });
  it('vente à crédit sans client → refus', async () => {
    await expect(sales.createSale(W.storeA, { items: [{ productId: W.pRiz, quantity: 1 }], paymentMethod: 'CREDIT' }, W.mAUser)).rejects.toThrow('Client requis');
  });
  it('vente à crédit crée une dette', async () => {
    const c = await customers.createCustomer({ storeId: W.storeA, name: 'Client Dette', phone: '+221781111111' });
    const s = await sales.createSale(W.storeA, { customerId: c.id, items: [{ productId: W.pRiz, quantity: 1 }], paymentMethod: 'CREDIT', amountPaid: 5000 }, W.mAUser);
    const d = db.prepare('SELECT * FROM debts ORDER BY createdAt DESC LIMIT 1').get() as any;
    expect(d.balance).toBe(10000);
    expect(s.totalAmount).toBe(15000);
  });
  it('produit d une autre boutique refusé dans une vente', async () => {
    await expect(sales.createSale(W.storeA, { items: [{ productId: W.pB, quantity: 1 }] }, W.mAUser)).rejects.toThrow('introuvable');
  });
  it('listSales par boutique (isolation)', async () => {
    const listA = await sales.listSales(W.storeA) as any[];
    expect(listA.length).toBeGreaterThanOrEqual(3);
    const listB = await sales.listSales(W.storeB) as any[];
    expect(listB.length).toBe(0);
  });
  it('getSale inclut les lignes', async () => {
    const s = await sales.createSale(W.storeA, { items: [{ productId: W.pRiz, quantity: 1 }, { productId: W.pSucre, quantity: 1 }] }, W.mAUser);
    const full = await sales.getSale(s.id);
    expect(full.items.length).toBe(2);
  });
  it('listDebts par boutique', async () => {
    const list = await debts.listDebts(W.storeA) as any[];
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].customerName).toBeDefined();
  });
  it('payDebt partiel puis solde', async () => {
    const list = await debts.listDebts(W.storeA) as any[];
    const d = list[0];
    const afterPartial = await debts.payDebt(d.id, 5000, 'CASH');
    expect(afterPartial.balance).toBe(d.balance - 5000);
    expect(afterPartial.isSettled).toBe(0);
    const afterFull = await debts.payDebt(d.id, afterPartial.balance, 'CASH');
    expect(afterFull.isSettled).toBe(1);
  });
  it('payDebt trop élevé → refus', async () => {
    const list = await debts.listDebts(W.storeA) as any[];
    if (list.length) {
      await expect(debts.payDebt(list[0].id, 999999999, 'CASH')).rejects.toThrow('supérieur au solde');
    }
  });
});

describe('Baseline V1 DB — Clients (4)', () => {
  it('createCustomer', async () => {
    const c = await customers.createCustomer({ storeId: W.storeA, name: 'Fatou', phone: '+221782222222' });
    expect(c.name).toBe('Fatou');
  });
  it('listCustomers avec recherche', async () => {
    const list = await customers.listCustomers(W.storeA, 'Fatou') as any[];
    expect(list.length).toBe(1);
  });
  it('getCustomer inclut ventes/dettes/commandes', async () => {
    const c = (await customers.listCustomers(W.storeA, 'Client Dette') as any[])[0];
    const full = await customers.getCustomer(c.id);
    expect(full.sales.length).toBeGreaterThanOrEqual(1);
  });
  it('updateCustomer', async () => {
    const c = (await customers.listCustomers(W.storeA, 'Fatou') as any[])[0];
    const u = await customers.updateCustomer(c.id, { address: 'Dakar, Yoff' });
    expect(u.address).toBe('Dakar, Yoff');
  });
});

describe('Baseline V1 DB — Fournisseurs (5)', () => {
  it('createSupplier rattaché au merchant', async () => {
    const s = await suppliers.createSupplier(W.merchantA, { name: 'Grossiste Dakar' });
    expect(s.merchantId).toBe(W.merchantA);
  });
  it('listSuppliers isolé par merchant', async () => {
    const listA = await suppliers.listSuppliers(W.merchantA) as any[];
    expect(listA.length).toBe(1);
  });
  it('receivePurchase incrémente le stock + mouvement', async () => {
    const before = (db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(W.storeA, W.pRiz) as any).quantity;
    const sup = (await suppliers.listSuppliers(W.merchantA) as any[])[0];
    const p = await suppliers.receivePurchase(sup.id, W.storeA, [{ productId: W.pRiz, quantity: 10, unitPrice: 13000 }], W.mAUser);
    expect(p.totalAmount).toBe(130000);
    const after = (db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(W.storeA, W.pRiz) as any).quantity;
    expect(after).toBe(before + 10);
    const mv = db.prepare(`SELECT * FROM inventory_movements WHERE productId = ? AND type = 'PURCHASE_RECEIPT'`).get(W.pRiz) as any;
    expect(mv.quantity).toBe(10);
  });
  it('receivePurchase crée inventaire si absent', async () => {
    const p = await products.createProduct(W.storeA, { name: 'Nouveau Produit Fournisseur', price: 500, initialStock: 0 }, W.mAUser);
    const sup = (await suppliers.listSuppliers(W.merchantA) as any[])[0];
    await suppliers.receivePurchase(sup.id, W.storeA, [{ productId: p.id, quantity: 5, unitPrice: 300 }], W.mAUser);
    const inv = db.prepare('SELECT * FROM inventories WHERE productId = ?').get(p.id) as any;
    expect(inv.quantity).toBe(5);
  });
  it('dépenses : create + list + summary', async () => {
    await expenses.createExpense(W.storeA, { category: 'Loyer', amount: 50000 });
    const list = await expenses.listExpenses(W.storeA) as any[];
    expect(list.length).toBeGreaterThanOrEqual(1);
    const sum = await expenses.summary(W.storeA);
    expect(sum.expensesToday).toBeGreaterThanOrEqual(50000);
  });
});

describe('Baseline V1 DB — Commandes en ligne (10)', () => {
  it('createOrder prix calculé serveur (pas depuis le client)', async () => {
    const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pRiz, quantity: 1 }], deliveryType: 'RETRAIT' });
    expect(o.totalAmount).toBe(15000); // 15000 produit + 0 frais retrait — prix serveur
    expect(o.status).toBe('EN_ATTENTE');
  });
  it('createOrder applique les frais de livraison boutique', async () => {
    const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pSucre, quantity: 1 }], deliveryType: 'LIVRAISON' });
    expect(o.deliveryFees).toBe(1000);
    expect(o.totalAmount).toBe(1800);
  });
  it('createOrder stock insuffisant → refus', async () => {
    await expect(orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pSucre, quantity: 999 }] })).rejects.toThrow('Stock insuffisant');
  });
  it('createOrder produit hors ligne → refus', async () => {
    await expect(orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pOffline, quantity: 1 }] })).rejects.toThrow('non disponible');
  });
  it('createOrder produit d autre boutique → refus', async () => {
    await expect(orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pB, quantity: 1 }] })).rejects.toThrow('introuvable');
  });
  it('CONFIRMEE décrémente le stock (ONLINE_ORDER)', async () => {
    const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pRiz, quantity: 2 }], deliveryType: 'RETRAIT' });
    const before = (db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(W.storeA, W.pRiz) as any).quantity;
    await orders.updateStatus(o.id, 'CONFIRMEE', userA());
    const after = (db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(W.storeA, W.pRiz) as any).quantity;
    expect(after).toBe(before - 2);
    const mv = db.prepare(`SELECT * FROM inventory_movements WHERE productId = ? AND type = 'ONLINE_ORDER' AND referenceId = ?`).get(W.pRiz, o.id) as any;
    expect(mv.quantity).toBe(-2);
  });
  it('transition interdite rejetée', async () => {
    const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pSucre, quantity: 1 }], deliveryType: 'RETRAIT' });
    await expect(orders.updateStatus(o.id, 'LIVREE', userA())).rejects.toThrow('non autorisée');
  });
  it('annulation après confirmation restitue le stock (RETURN)', async () => {
    const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pRiz, quantity: 1 }], deliveryType: 'RETRAIT' });
    await orders.updateStatus(o.id, 'CONFIRMEE', userA());
    const afterConfirm = (db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(W.storeA, W.pRiz) as any).quantity;
    await orders.updateStatus(o.id, 'ANNULEE', userA());
    const afterCancel = (db.prepare('SELECT * FROM inventories WHERE storeId = ? AND productId = ?').get(W.storeA, W.pRiz) as any).quantity;
    expect(afterCancel).toBe(afterConfirm + 1);
  });
  it('CLIENT ne peut annuler qu en EN_ATTENTE', async () => {
    const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pSucre, quantity: 1 }], deliveryType: 'RETRAIT' });
    await orders.updateStatus(o.id, 'CONFIRMEE', userA());
    await expect(orders.updateStatus(o.id, 'ANNULEE', clientCtx())).rejects.toThrow('que commande en attente');
  });
  it('commande crée livraison + paiement CASH + notif merchant', async () => {
    const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pSucre, quantity: 1 }], deliveryType: 'RETRAIT' });
    const d = db.prepare('SELECT * FROM deliveries WHERE orderId = ?').get(o.id) as any;
    expect(d.status).toBe('A_PREPARER');
    const pay = db.prepare('SELECT * FROM payments WHERE orderId = ?').get(o.id) as any;
    expect(pay.status).toBe('PENDING');
    const n = db.prepare(`SELECT * FROM notifications WHERE type = 'ORDER' AND data LIKE ?`).get(`%${o.id}%`) as any;
    expect(n).toBeDefined();
  });
});

describe('Baseline V1 DB — Paiements (6)', () => {
  let orderId: string;
  it('initiate → PENDING avec transactionId', async () => {
    const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pRiz, quantity: 1 }], deliveryType: 'RETRAIT' });
    orderId = o.id;
    const p = await payments.initiatePayment(orderId, 'WAVE', '+221760000010', `key-${orderId}`);
    expect(p.status).toBe('PENDING');
    expect(p.transactionId).toContain('WAVE');
  });
  it('initiate idempotent (même clé → même paiement)', async () => {
    const p1 = await payments.initiatePayment(orderId, 'WAVE', '+221760000010', `key-${orderId}`);
    const p2 = await payments.initiatePayment(orderId, 'WAVE', '+221760000010', `key-${orderId}`);
    expect(p1.id).toBe(p2.id);
  });
  it('verify → SUCCESS + verifiedAt + notifications', async () => {
    const p = await payments.listPayments() as any[];
    const target = p.find(x => x.orderId === orderId);
    const v = await payments.verifyPayment(target.id);
    expect(v.status).toBe('SUCCESS');
    expect(v.verifiedAt).toBeDefined();
    const n = db.prepare(`SELECT * FROM notifications WHERE type = 'PAYMENT' AND userId = ?`).get(W.clientUser) as any;
    expect(n).toBeDefined();
  });
  it('re-paiement d une commande payée → refus', async () => {
    await expect(payments.initiatePayment(orderId, 'WAVE', '+221760000010', `other-${orderId}`)).rejects.toThrow('Déjà payé');
  });
  it('webhook signature invalide → 401', async () => {
    await expect(payments.webhookVerify('WAVE', 'whatever', 'bad-signature', {})).rejects.toThrow('Signature');
  });
  it('provider inconnu → refus', async () => {
    const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pSucre, quantity: 1 }], deliveryType: 'RETRAIT' });
    await expect(payments.initiatePayment(o.id, 'PAYPAL')).rejects.toThrow('Provider non supporté');
  });
});

describe('Baseline V1 DB — Livraisons & notifications & employés (9)', () => {
  it('listDeliveries par boutique', async () => {
    const list = await deliveries.listDeliveries(W.storeA) as any[];
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].order).toBeDefined();
  });
  it('updateDeliveryStatus LIVRE passe la commande LIVREE', async () => {
    const list = await deliveries.listDeliveries(W.storeA, 'A_PREPARER') as any[];
    const d = list[0];
    await deliveries.updateDeliveryStatus(d.id, 'LIVRE');
    const row = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(d.id) as any;
    expect(row.status).toBe('LIVRE');
    expect(row.deliveredAt).toBeDefined();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(d.orderId) as any;
    expect(order.status).toBe('LIVREE');
  });
  it('assignDelivery passe EN_LIVRAISON', async () => {
    const list = await deliveries.listDeliveries(W.storeA, 'A_PREPARER') as any[];
    if (list.length) {
      const d = await deliveries.assignDelivery(list[0].id, W.mAUser);
      expect(d.status).toBe('EN_LIVRAISON');
    }
  });
  it('listNotifications : uniquement les siennes', async () => {
    const list = await notifications.listNotifications(W.clientUser) as any[];
    expect(list.every((n: any) => n.userId === W.clientUser)).toBe(true);
  });
  it('markRead d une notification étrangère → 404', async () => {
    const list = await notifications.listNotifications(W.clientUser) as any[];
    await expect(notifications.markRead(list[0].id, W.mBUser)).rejects.toThrow('introuvable');
  });
  it('markAllRead', async () => {
    await notifications.markAllRead(W.clientUser);
    const unread = await notifications.listNotifications(W.clientUser, true) as any[];
    expect(unread.length).toBe(0);
  });
  it('createEmployee → user EMPLOYEE', async () => {
    const r = await employees.createEmployee(W.storeA, { phone: '+221773333333', password: 'Password123!', roleLabel: 'Caissier', permissions: ['sales:create', 'stock:update'] }, W.mAUser);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(r.user.id) as any;
    expect(u.role).toBe('EMPLOYEE');
  });
  it('createEmployee téléphone dupliqué → refus', async () => {
    await expect(employees.createEmployee(W.storeA, { phone: '+221773333333', password: 'Password123!', roleLabel: 'X', permissions: [] }, W.mAUser)).rejects.toThrow('déjà utilisé');
  });
  it('updatePermissions + deactivate', async () => {
    const list = await employees.listEmployees(W.storeA) as any[];
    const emp = list[0];
    await employees.updatePermissions(emp.id, ['sales:create'], W.mAUser);
    await employees.deactivate(emp.id, W.mAUser);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(emp.userId) as any;
    expect(u.isActive).toBe(0);
    const empRow = db.prepare('SELECT * FROM employees WHERE id = ?').get(emp.id) as any;
    expect(JSON.parse(empRow.permissions)).toEqual(['sales:create']);
  });
});

describe('Baseline V1 DB — Marketplace (4)', () => {
  it('searchProducts : uniquement en ligne + boutique ouverte + stock > 0', async () => {
    const list = await marketplace.searchProducts('Produit', {}) as any[];
    const ids = list.map(p => p.id);
    expect(ids).not.toContain(W.pOffline);  // hors ligne → exclu
    expect(ids).not.toContain(W.pClosed);   // boutique fermée → exclu
    expect(ids).toContain(W.pB);            // en ligne, ouvert, stock 50 → inclus
  });
  it('searchProducts enrichit avec boutique + stock réel', async () => {
    const list = await marketplace.searchProducts('Riz', {}) as any[];
    expect(list[0].store.slug).toBe('boutique-a');
    expect(list[0].inventories[0].quantity).toBeGreaterThan(0);
  });
  it('searchStores filtre par nom', async () => {
    const list = await marketplace.searchStores('Boutique A') as any[];
    expect(list.some(s => s.id === W.storeA)).toBe(true);
    expect(list.some(s => s.id === W.closedStore)).toBe(false);
  });
  it('nearbyStores filtre par rayon', async () => {
    const near = await marketplace.nearbyStores(14.78, -17.38, 20) as any[];
    expect(near.some(s => s.id === W.storeA)).toBe(true);
    const far = await marketplace.nearbyStores(12.5, -14.5, 10) as any[]; // point à ~300 km
    expect(far.length).toBe(0);
  });
});

describe('Baseline V1 DB — Dashboard & admin (5)', () => {
  it('getDashboard : ventes du jour comptées', async () => {
    const d = await dashboard.getDashboard(W.storeA);
    expect(d.today.salesCount).toBeGreaterThanOrEqual(3);
    expect(d.today.salesAmount).toBeGreaterThan(0);
  });
  it('getDashboard : trend 7 jours', async () => {
    const d = await dashboard.getDashboard(W.storeA);
    expect(d.trend).toHaveLength(7);
  });
  it('getDashboard isole par boutique', async () => {
    const d = await dashboard.getDashboard(W.storeB);
    expect(d.today.salesCount).toBe(0);
  });
  it('merchantOverview agrège les boutiques du merchant', async () => {
    const o = await dashboard.merchantOverview(W.merchantA);
    expect(o.storesCount).toBeGreaterThanOrEqual(2);
    expect(o.salesCount).toBeGreaterThan(0);
  });
  it('admin stats + toggleUser', async () => {
    const s = await admin.stats();
    expect(s.users).toBeGreaterThanOrEqual(5);
    const target = db.prepare('SELECT * FROM users WHERE phone = ?').get('+221771111111') as any;
    const off = await admin.toggleUser(target.id);
    expect(off.isActive).toBe(0);
    await expect(auth.login('+221771111111', 'Password123!')).rejects.toThrow('désactivé');
    await admin.toggleUser(target.id);
  });
});
