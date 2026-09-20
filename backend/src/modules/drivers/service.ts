import db, { cuid } from '../../lib/db';
import bcrypt from 'bcryptjs';

function nowIso() { return new Date().toISOString(); }

/**
 * LOT E — Livreurs : gestion par le marchand (employeur).
 * Un livreur peut avoir un compte utilisateur (role DRIVER) pour l'app livreur.
 */
export function createDriver(user: any, data: { name: string; phone: string; vehicle?: string; password?: string }) {
  if (user.role !== 'MERCHANT' && user.role !== 'ADMIN') throw Object.assign(new Error('Réservé aux commerçants'), { status: 403 });
  if (!data.name || !data.phone) throw Object.assign(new Error('Nom et téléphone requis'), { status: 400 });
  const exists = db.prepare('SELECT id FROM drivers WHERE phone = ?').get(data.phone);
  if (exists) throw Object.assign(new Error('Un livreur avec ce téléphone existe déjà'), { status: 400 });

  let userId: string | null = null;
  if (data.password) {
    if (data.password.length < 8) throw Object.assign(new Error('Mot de passe : 8 caractères minimum'), { status: 400 });
    const existingUser = db.prepare('SELECT id, role FROM users WHERE phone = ?').get(data.phone) as any;
    if (existingUser) throw Object.assign(new Error('Un compte existe déjà avec ce téléphone'), { status: 400 });
    userId = cuid();
    db.prepare('INSERT INTO users (id, phone, email, passwordHash, role, isPhoneVerified, createdAt, updatedAt) VALUES (?,?,?,?,?,1,?,?)')
      .run(userId, data.phone, null, bcrypt.hashSync(data.password, 10), 'DRIVER', nowIso(), nowIso());
  }

  const id = cuid();
  db.prepare('INSERT INTO drivers (id, merchantId, userId, name, phone, vehicle, isActive, createdAt, updatedAt) VALUES (?,?,?,?,?,?,1,?,?)')
    .run(id, user.merchantId, userId, data.name, data.phone, data.vehicle || null, nowIso(), nowIso());
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, createdAt) VALUES (?,?,?,?,?,?)')
    .run(cuid(), user.userId, 'DRIVER_CREATE', 'Driver', id, nowIso());
  return db.prepare('SELECT id, merchantId, userId, name, phone, vehicle, isActive, createdAt FROM drivers WHERE id = ?').get(id);
}

export function listDrivers(user: any) {
  const rows = db.prepare('SELECT * FROM drivers WHERE merchantId = ? ORDER BY createdAt DESC').all(user.merchantId) as any[];
  return rows.map((d) => ({
    id: d.id, name: d.name, phone: d.phone, vehicle: d.vehicle, isActive: !!d.isActive,
    hasAccount: !!d.userId,
    activeDeliveries: (db.prepare(`SELECT COUNT(*) as c FROM deliveries WHERE driverId = ? AND status IN ('PRET','EN_LIVRAISON')`).get(d.id) as any).c,
    deliveredCount: (db.prepare(`SELECT COUNT(*) as c FROM deliveries WHERE driverId = ? AND status = 'LIVRE'`).get(d.id) as any).c,
  }));
}

export function updateDriver(user: any, driverId: string, data: { isActive?: boolean; vehicle?: string; name?: string }) {
  const d = db.prepare('SELECT * FROM drivers WHERE id = ?').get(driverId) as any;
  if (!d || d.merchantId !== user.merchantId) throw Object.assign(new Error('Livreur introuvable'), { status: 404 });
  db.prepare('UPDATE drivers SET name = ?, vehicle = ?, isActive = ?, updatedAt = ? WHERE id = ?')
    .run(data.name ?? d.name, data.vehicle ?? d.vehicle, data.isActive === undefined ? d.isActive : (data.isActive ? 1 : 0), nowIso(), driverId);
  const row = db.prepare('SELECT id, name, phone, vehicle, isActive FROM drivers WHERE id = ?').get(driverId) as any;
  return { ...row, isActive: !!row.isActive };
}
