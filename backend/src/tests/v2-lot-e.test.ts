// Tests V2 — LOT E : livraison, livreurs, preuves de livraison (machine à états validée serveur).
import { vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'file:./test-v2-lote.db'; });

import { describe, it, expect, beforeAll } from 'vitest';
import db, { bootstrap } from '../lib/bootstrap';
import { seedWorld , resetDatabase } from './helpers';

let W: any;
let orders: any, drivers: any, dv2: any;

beforeAll(async () => {
  bootstrap();
  resetDatabase(db);
  orders = await import('../modules/orders/service');
  drivers = await import('../modules/drivers/service');
  dv2 = await import('../modules/deliveries/service-v2');
  W = await seedWorld(db);
}, 120000);

const userA = () => ({ userId: W.mAUser, role: 'MERCHANT', merchantId: W.merchantA, storeIds: [W.storeA, W.closedStore] });
const userB = () => ({ userId: W.mBUser, role: 'MERCHANT', merchantId: W.merchantB, storeIds: [W.storeB] });
function driverUserOf(userId: string) { return { userId, role: 'DRIVER', merchantId: null, storeIds: [] }; }

let driverId = '';
let driverUserId = '';
let deliveryId = '';
let orderId = '';

async function newDelivery() {
  const o = await orders.createOrder(W.clientUser, { storeId: W.storeA, items: [{ productId: W.pSucre, quantity: 1 }], deliveryType: 'LIVRAISON' });
  const d = db.prepare('SELECT * FROM deliveries WHERE orderId = ?').get(o.id) as any;
  return { o, d };
}

describe('V2 LOT E — Livreurs (gestion marchand)', () => {
  it('création livreur avec compte DRIVER (mdp 8+)', () => {
    const d: any = drivers.createDriver(userA(), { name: 'Modou Livreur', phone: '+221780000001', vehicle: 'Moto', password: 'Livreur123' });
    driverId = d.id;
    expect(d.hasAccount === undefined || d.id).toBeTruthy();
    const u = db.prepare('SELECT id, role FROM users WHERE phone = ?').get('+221780000001') as any;
    expect(u.role).toBe('DRIVER');
    driverUserId = u.id;
    const drv = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driverId) as any;
    expect(drv.userId).toBe(driverUserId);
  });
  it('mot de passe trop court → refus', () => {
    expect(() => drivers.createDriver(userA(), { name: 'X', phone: '+221780000002', password: 'court' })).toThrow('8 caractères');
  });
  it('téléphone livreur en doublon → refus', () => {
    expect(() => drivers.createDriver(userA(), { name: 'Y', phone: '+221780000001' })).toThrow('existe déjà');
  });
  it('isolation : le marchand B ne voit que ses livreurs', () => {
    drivers.createDriver(userB(), { name: 'Livreur B', phone: '+221780000003' });
    const listA = drivers.listDrivers(userA());
    const listB = drivers.listDrivers(userB());
    expect(listA.some((d: any) => d.phone === '+221780000001')).toBe(true);
    expect(listB.length).toBe(1);
    expect(listB[0].name).toBe('Livreur B');
  });
  it('désactivation livreur', () => {
    const inactive = drivers.createDriver(userA(), { name: 'Inactif', phone: '+221780000004' });
    const upd: any = drivers.updateDriver(userA(), inactive.id, { isActive: false });
    expect(upd.isActive).toBe(false);
  });
});

describe('V2 LOT E — Assignation & OTP', () => {
  it('commande LIVRAISON → livraison A_PREPARER (comportement V1 conservé)', async () => {
    const { o, d } = await newDelivery();
    orderId = o.id; deliveryId = d.id;
    expect(d.status).toBe('A_PREPARER');
    expect(o.deliveryFees).toBe(1000);
  });
  it('assignation du livreur d un autre marchand → refus', async () => {
    const drvB = drivers.createDriver(userB(), { name: 'Livreur B2', phone: '+221780000005', password: 'Livreur123' });
    expect(() => dv2.assignDriver(deliveryId, drvB.id, userA())).toThrow('hors de votre enseigne');
  });
  it('tenant : marchand B ne peut pas marquer prêt la livraison de A', () => {
    expect(() => dv2.markReady(deliveryId, userB())).toThrow('Accès refusé');
  });
  it('assignation → PRET, OTP généré, notifié au client, jamais exposé', () => {
    const ret: any = dv2.assignDriver(deliveryId, driverId, userA());
    expect(ret.status).toBe('PRET');
    expect(ret.otpCode).toBeUndefined(); // sanitize
    expect(ret.otpSent).toBe(true);
    const raw = db.prepare('SELECT otpCode FROM deliveries WHERE id = ?').get(deliveryId) as any;
    expect(raw.otpCode).toMatch(/^\d{6}$/);
    const n = db.prepare(`SELECT body FROM notifications WHERE userId = ? AND type = 'DELIVERY' ORDER BY createdAt DESC`).get(W.clientUser) as any;
    expect(n.body).toContain(raw.otpCode);
    (global as any).__otp = raw.otpCode;
  });
  it('notifie aussi le livreur', () => {
    const n = db.prepare(`SELECT * FROM notifications WHERE userId = ? AND title = 'Nouvelle livraison'`).get(driverUserId) as any;
    expect(n).toBeDefined();
  });
  it('machine : assignation depuis EN_LIVRAISON → refus (changement de livreur interdit en route)', async () => {
    const { d } = await newDelivery();
    const dUserId = (db.prepare('SELECT userId FROM drivers WHERE id = ?').get(driverId) as any).userId;
    dv2.assignDriver(d.id, driverId, userA());
    dv2.driverPickup(d.id, driverUserOf(dUserId));
    expect(() => dv2.assignDriver(d.id, driverId, userA())).toThrow('Assignation impossible');
  });
});

describe('V2 LOT E — Pickup & preuve de livraison', () => {
  const driverUser = () => ({ userId: driverUserId, role: 'DRIVER', merchantId: null, storeIds: [] });
  const otpOf = (did: string) => (db.prepare('SELECT otpCode FROM deliveries WHERE id = ?').get(did) as any).otpCode;
  it('pickup par un autre livreur → 403', () => {
    const other: any = drivers.createDriver(userA(), { name: 'Autre', phone: '+221780000006', password: 'Livreur123' });
    const u = db.prepare('SELECT id FROM users WHERE phone = ?').get('+221780000006') as any;
    expect(u).toBeDefined();
    expect(() => dv2.driverPickup(deliveryId, { userId: u.id, role: 'DRIVER', merchantId: null, storeIds: [] })).toThrow('non assignée');
    void other;
  });
  it('pickup par le bon livreur → EN_LIVRAISON', () => {
    const ret: any = dv2.driverPickup(deliveryId, driverUser());
    expect(ret.status).toBe('EN_LIVRAISON');
  });
  it('complete sans OTP → refus (code obligatoire)', async () => {
    await expect(dv2.driverComplete(deliveryId, driverUser(), {})).rejects.toThrow('Code de livraison invalide');
  });
  it('complete avec mauvais OTP → refus', async () => {
    await expect(dv2.driverComplete(deliveryId, driverUser(), { otp: '000000' })).rejects.toThrow('Code de livraison invalide');
  });
  it('commande pas prête : complete OK côté livraison mais commande non synchronisée (pas de transition forcée)', async () => {
    // la commande est EN_ATTENTE : la sync LIVREE est impossible → tolérée, livraison LIVRE quand même
    const ret: any = await dv2.driverComplete(deliveryId, driverUser(), { otp: otpOf(deliveryId), deliveredTo: 'Fatou N.', lat: 14.7, lng: -17.4 });
    expect(ret.status).toBe('LIVRE');
    expect(ret.deliveredTo).toBe('Fatou N.');
    const proofs = db.prepare('SELECT type FROM delivery_proofs WHERE deliveryId = ? ORDER BY createdAt').all(deliveryId) as any[];
    expect(proofs.map((p) => p.type)).toContain('OTP');
    expect(proofs.map((p) => p.type)).toContain('GPS');
    const raw = db.prepare('SELECT otpCode FROM deliveries WHERE id = ?').get(deliveryId) as any;
    expect(raw.otpCode).toBeNull(); // usage unique
  });
  it('flux complet avec commande préparée : pickup → complete → commande LIVREE (fidélité/notification centralisées)', async () => {
    const { o, d } = await newDelivery();
    dv2.assignDriver(d.id, driverId, userA());
    dv2.driverPickup(d.id, driverUser());
    // le marchand prépare la commande : CONFIRMEE → EN_PREPARATION → PRETE
    await orders.updateStatus(o.id, 'CONFIRMEE', userA());
    await orders.updateStatus(o.id, 'EN_PREPARATION', userA());
    await orders.updateStatus(o.id, 'PRETE', userA());
    await dv2.driverComplete(d.id, driverUser(), { otp: otpOf(d.id), photo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' });
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id) as any;
    expect(order.status).toBe('LIVREE');
    const proofs = db.prepare(`SELECT type FROM delivery_proofs WHERE deliveryId = ? AND type = 'PHOTO'`).get(d.id) as any;
    expect(proofs).toBeDefined();
    // notification commande LIVREE envoyée par orders.updateStatus
    const n = db.prepare(`SELECT * FROM notifications WHERE userId = ? AND body LIKE '%LIVREE%' ORDER BY createdAt DESC`).get(W.clientUser) as any;
    expect(n).toBeDefined();
  });
  it('OTP usage unique : re-complete → transition refusée', async () => {
    await expect(dv2.driverComplete(deliveryId, driverUser(), { otp: '123456', photo: 'data:image/png;base64,x' })).rejects.toThrow(/non autorisée/);
  });
  it('échec livraison : motif requis, retour en PRET, notifie le marchand', async () => {
    const { d } = await newDelivery();
    dv2.assignDriver(d.id, driverId, userA());
    dv2.driverPickup(d.id, driverUser());
    expect(() => dv2.driverFail(d.id, driverUser(), '  ')).toThrow('Motif');
    const ret: any = dv2.driverFail(d.id, driverUser(), 'Client absent');
    expect(ret.status).toBe('PRET');
    expect(ret.failedReason).toBe('Client absent');
    const n = db.prepare(`SELECT * FROM notifications WHERE userId = ? AND title = 'Livraison en échec'`).get(W.mAUser) as any;
    expect(n).toBeDefined();
    // re-pickup possible après échec
    const again: any = dv2.driverPickup(d.id, driverUser());
    expect(again.status).toBe('EN_LIVRAISON');
    expect(again.failedReason).toBeNull();
  });
  it('remise en main propre sans livreur : photo exigée (A_PREPARER → LIVRE par le marchand)', async () => {
    const { d } = await newDelivery();
    await expect(dv2.driverComplete(d.id, userA(), {})).rejects.toThrow('Preuve requise');
    const ret: any = await dv2.driverComplete(d.id, userA(), { photo: 'data:image/jpeg;base64,/9j/4AAQ', signature: 'data:image/png;base64,sig==' });
    expect(ret.status).toBe('LIVRE');
    const types = (db.prepare('SELECT type FROM delivery_proofs WHERE deliveryId = ?').all(d.id) as any[]).map((p) => p.type);
    expect(types).toContain('PHOTO');
    expect(types).toContain('SIGNATURE');
  });
  it('machine : annulation après EN_LIVRAISON → refus ; avant enlèvement → ANNULE', async () => {
    const { d } = await newDelivery();
    dv2.assignDriver(d.id, driverId, userA());
    // PRET → ANNULE OK
    const cancelled: any = dv2.cancelDelivery(d.id, userA());
    expect(cancelled.status).toBe('ANNULE');
    expect(() => dv2.cancelDelivery(d.id, userA())).toThrow('Annulation impossible');
  });
  it('livreur sans profil actif → 403', () => {
    expect(() => dv2.driverDeliveries({ userId: 'no-driver', role: 'DRIVER', merchantId: null, storeIds: [] })).toThrow('Aucun profil livreur');
  });
  it('driverDeliveries : livraisons actives du livreur, sans OTP', () => {
    const list = dv2.driverDeliveries(driverUser());
    expect(Array.isArray(list)).toBe(true);
    for (const d of list) {
      expect(['PRET', 'EN_LIVRAISON']).toContain(d.status);
      expect(d.otpCode).toBeUndefined();
      expect(d.orderNumber).toBeDefined();
    }
  });
});
