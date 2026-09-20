import db from '../../lib/db';
import bcrypt from 'bcryptjs';
import { assertStoreAccess } from '../../middlewares/tenant';
import * as ordersService from '../orders/service';

function nowIso() { return new Date().toISOString(); }
function cuid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

/**
 * LOT E — Livraisons V2 : livreurs, machine à états validée serveur, preuves (OTP/photo/signature/GPS).
 * Les fonctions legacy V1 (updateDeliveryStatus, assignDelivery employé) restent inchangées
 * dans ce fichier pour compatibilité ascendante.
 */

// ---------- Machine à états ----------

const DELIVERY_TRANSITIONS: Record<string, string[]> = {
  A_PREPARER: ['PRET', 'LIVRE', 'ANNULE'], // LIVRE direct = remise en main propre
  PRET: ['EN_LIVRAISON', 'LIVRE', 'ANNULE'],
  EN_LIVRAISON: ['LIVRE', 'PRET'], // PRET = échec livraison (retour colis, motif requis)
  LIVRE: [],
  ANNULE: [],
};

export function canTransitionDelivery(from: string, to: string): boolean {
  return DELIVERY_TRANSITIONS[from]?.includes(to) || false;
}

function getDelivery(id: string) {
  const d = db.prepare('SELECT * FROM deliveries WHERE id = ?').get(id) as any;
  if (!d) throw Object.assign(new Error('Livraison introuvable'), { status: 404 });
  return d;
}

function assertMerchantAccess(d: any, user: any) {
  assertStoreAccess(d.storeId, user);
}

function notify(userId: string, title: string, body: string, data: any = {}) {
  db.prepare('INSERT INTO notifications (id, userId, title, body, type, data, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), userId, title, body, 'DELIVERY', JSON.stringify(data), nowIso());
}

function driverByUser(userId: string) {
  return db.prepare('SELECT * FROM drivers WHERE userId = ? AND isActive = 1').get(userId) as any;
}

// ---------- Marchand : préparation & assignation ----------

/** Colis prêt à être remis au livreur (A_PREPARER → PRET). */
export function markReady(deliveryId: string, user: any) {
  const d = getDelivery(deliveryId);
  assertMerchantAccess(d, user);
  if (!canTransitionDelivery(d.status, 'PRET')) {
    throw Object.assign(new Error(`Transition ${d.status} -> PRET non autorisée`), { status: 400 });
  }
  db.prepare('UPDATE deliveries SET status = ?, updatedAt = ? WHERE id = ?').run('PRET', nowIso(), deliveryId);
  return sanitize(getDelivery(deliveryId));
}

/** Assignation d'un livreur (marchand). Génère l'OTP envoyé au client. */
export function assignDriver(deliveryId: string, driverId: string, user: any) {
  const d = getDelivery(deliveryId);
  assertMerchantAccess(d, user);
  if (!['A_PREPARER', 'PRET'].includes(d.status)) {
    throw Object.assign(new Error(`Assignation impossible depuis le statut ${d.status}`), { status: 400 });
  }
  const driver = db.prepare('SELECT * FROM drivers WHERE id = ? AND isActive = 1').get(driverId) as any;
  if (!driver || driver.merchantId !== user.merchantId) {
    throw Object.assign(new Error('Livreur introuvable ou hors de votre enseigne'), { status: 400 });
  }
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const newStatus = d.status === 'A_PREPARER' ? 'PRET' : d.status;
  db.prepare('UPDATE deliveries SET driverId = ?, status = ?, otpCode = ?, otpSentAt = ?, failedReason = NULL, updatedAt = ? WHERE id = ?')
    .run(driverId, newStatus, otp, nowIso(), nowIso(), deliveryId);

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(d.orderId) as any;
  if (order?.clientId) {
    notify(order.clientId, 'Code de livraison', `Votre commande ${order.orderNumber} sera livrée par ${driver.name}. Code de remise : ${otp}`, { deliveryId, orderId: order.id });
  }
  if (driver.userId) {
    notify(driver.userId, 'Nouvelle livraison', `Livraison assignée : ${order?.orderNumber || d.orderId}`, { deliveryId });
  }
  return sanitize(getDelivery(deliveryId));
}

/** Annulation par le marchand (avant enlèvement). */
export function cancelDelivery(deliveryId: string, user: any) {
  const d = getDelivery(deliveryId);
  assertMerchantAccess(d, user);
  if (!canTransitionDelivery(d.status, 'ANNULE')) {
    throw Object.assign(new Error(`Annulation impossible depuis le statut ${d.status}`), { status: 400 });
  }
  const driver = d.driverId ? db.prepare('SELECT * FROM drivers WHERE id = ?').get(d.driverId) as any : null;
  db.prepare('UPDATE deliveries SET status = ?, updatedAt = ? WHERE id = ?').run('ANNULE', nowIso(), deliveryId);
  if (driver?.userId) notify(driver.userId, 'Livraison annulée', `La livraison a été annulée par le commerçant.`, { deliveryId });
  return sanitize(getDelivery(deliveryId));
}

// ---------- Livreur ----------

/** Livraisons du livreur connecté (sans jamais exposer l'OTP). */
export function driverDeliveries(user: any) {
  const driver = driverByUser(user.userId);
  if (!driver) throw Object.assign(new Error('Aucun profil livreur actif pour ce compte'), { status: 403 });
  const rows = db.prepare(`
    SELECT d.*, o.orderNumber, o.totalAmount, o.addressId, s.name as storeName
    FROM deliveries d
    JOIN orders o ON o.id = d.orderId
    JOIN stores s ON s.id = d.storeId
    WHERE d.driverId = ? AND d.status IN ('PRET','EN_LIVRAISON')
    ORDER BY d.updatedAt DESC`).all(driver.id) as any[];
  return rows.map((d) => {
    const addr = d.addressId ? db.prepare('SELECT * FROM addresses WHERE id = ?').get(d.addressId) : null;
    return { ...sanitize(d), address: addr };
  });
}

/** Enlèvement du colis par le livreur (PRET → EN_LIVRAISON). */
export function driverPickup(deliveryId: string, user: any) {
  const driver = driverByUser(user.userId);
  if (!driver) throw Object.assign(new Error('Aucun profil livreur actif pour ce compte'), { status: 403 });
  const d = getDelivery(deliveryId);
  if (d.driverId !== driver.id) throw Object.assign(new Error('Livraison non assignée à ce livreur'), { status: 403 });
  if (!canTransitionDelivery(d.status, 'EN_LIVRAISON')) {
    throw Object.assign(new Error(`Transition ${d.status} -> EN_LIVRAISON non autorisée`), { status: 400 });
  }
  db.prepare('UPDATE deliveries SET status = ?, failedReason = NULL, updatedAt = ? WHERE id = ?').run('EN_LIVRAISON', nowIso(), deliveryId);
  return sanitize(getDelivery(deliveryId));
}

/**
 * Remise au client (EN_LIVRAISON → LIVRE) avec preuve.
 * Règles serveur : OTP obligatoire si un code a été envoyé (usage unique, jamais retourné
 * au livreur) ; sinon au moins une preuve (photo/signature). La commande passe LIVREE
 * via orders.updateStatus (source unique : fidélité + notifications centralisées).
 */
export async function driverComplete(deliveryId: string, user: any, data: { otp?: string; photo?: string; signature?: string; lat?: number; lng?: number; deliveredTo?: string }) {
  const d = getDelivery(deliveryId);
  const driver = driverByUser(user.userId);
  const isDriver = driver && d.driverId === driver.id;
  if (!isDriver) {
    // repli : le marchand/employé remet en main propre (pas de livreur ou remise directe)
    assertMerchantAccess(d, user);
    if (driver && d.driverId && d.driverId !== driver.id && user.role === 'DRIVER') {
      throw Object.assign(new Error('Livraison non assignée à ce livreur'), { status: 403 });
    }
    if (user.role === 'DRIVER') throw Object.assign(new Error('Livraison non assignée à ce livreur'), { status: 403 });
  }
  if (!canTransitionDelivery(d.status, 'LIVRE')) {
    throw Object.assign(new Error(`Transition ${d.status} -> LIVRE non autorisée`), { status: 400 });
  }
  if (data.photo && data.photo.length > 700_000) throw Object.assign(new Error('Photo trop volumineuse (max ~500 Ko)'), { status: 400 });
  if (data.signature && data.signature.length > 700_000) throw Object.assign(new Error('Signature trop volumineuse'), { status: 400 });

  const proofs: { type: string; data?: string; lat?: number; lng?: number }[] = [];
  if (d.otpCode) {
    if (!data.otp || data.otp.trim() !== d.otpCode) {
      throw Object.assign(new Error('Code de livraison invalide'), { status: 400 });
    }
    proofs.push({ type: 'OTP', data: 'VERIFIE' });
  } else if (!data.photo && !data.signature) {
    throw Object.assign(new Error('Preuve requise : code OTP ou photo/signature'), { status: 400 });
  }
  if (data.photo) proofs.push({ type: 'PHOTO', data: data.photo });
  if (data.signature) proofs.push({ type: 'SIGNATURE', data: data.signature });
  if (typeof data.lat === 'number' && typeof data.lng === 'number') proofs.push({ type: 'GPS', lat: data.lat, lng: data.lng });

  db.prepare('UPDATE deliveries SET status = ?, deliveredAt = ?, deliveredTo = ?, otpCode = NULL, proofUrl = COALESCE(?, proofUrl), updatedAt = ? WHERE id = ?')
    .run('LIVRE', nowIso(), data.deliveredTo || null, (data.photo ? 'in_delivery_proofs' : null), nowIso(), deliveryId);
  for (const p of proofs) {
    db.prepare('INSERT INTO delivery_proofs (id, deliveryId, type, data, latitude, longitude, createdAt) VALUES (?,?,?,?,?,?,?)')
      .run(cuid(), deliveryId, p.type, p.data || null, p.lat ?? null, p.lng ?? null, nowIso());
  }

  // synchronise la commande (source unique : fidélité LOT C + notifications)
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(d.orderId) as any;
  if (order && order.status !== 'LIVREE' && order.status !== 'ANNULEE') {
    try {
      await ordersService.updateStatus(order.id, 'LIVREE', { userId: user.userId, role: 'SYSTEM', merchantId: null, storeIds: [] });
    } catch { /* commande déjà dans un état final — la livraison reste LIVRE */ }
  }
  return sanitize(getDelivery(deliveryId));
}

/** Échec de livraison (EN_LIVRAISON → PRET, motif requis, notifie le marchand). */
export function driverFail(deliveryId: string, user: any, reason: string) {
  const driver = driverByUser(user.userId);
  if (!driver) throw Object.assign(new Error('Aucun profil livreur actif pour ce compte'), { status: 403 });
  const d = getDelivery(deliveryId);
  if (d.driverId !== driver.id) throw Object.assign(new Error('Livraison non assignée à ce livreur'), { status: 403 });
  if (!canTransitionDelivery(d.status, 'PRET') || d.status !== 'EN_LIVRAISON') {
    throw Object.assign(new Error(`Transition ${d.status} -> PRET non autorisée`), { status: 400 });
  }
  if (!reason || !reason.trim()) throw Object.assign(new Error('Motif de l échec requis'), { status: 400 });
  db.prepare('UPDATE deliveries SET status = ?, failedReason = ?, updatedAt = ? WHERE id = ?').run('PRET', reason.trim(), nowIso(), deliveryId);
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(d.storeId) as any;
  const merchantUser = store ? (db.prepare('SELECT userId FROM merchants WHERE id = ?').get(store.merchantId) as any) : null;
  if (merchantUser) notify(merchantUser.userId, 'Livraison en échec', `Motif : ${reason.trim()}`, { deliveryId });
  return sanitize(getDelivery(deliveryId));
}

/** Masque l'OTP (jamais exposé au livreur ni au marchand après envoi). */
function sanitize(d: any) {
  if (!d) return d;
  const { otpCode, ...rest } = d;
  return { ...rest, otpSent: !!otpCode };
}

export { sanitize as sanitizeDelivery };
