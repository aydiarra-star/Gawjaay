import bcrypt from 'bcryptjs';
import { cuid, isPostgres } from '../lib/db';


/**
 * Vide la base entre deux fichiers de test — compatible SQLite ET PostgreSQL.
 * SQLite : PRAGMA foreign_keys OFF + DELETE (comportement historique conservé).
 * PostgreSQL : TRUNCATE ... CASCADE de toutes les tables du schéma public.
 */
export function resetDatabase(db: any, opts: { keepMigrations?: boolean } = { keepMigrations: true }) {
  const keep = opts.keepMigrations !== false;
  if (isPostgres) {
    const rows = db
      .prepare("SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'")
      .all() as any[];
    const tables = rows.map((t) => t.name).filter((n) => !(keep && n === '_migrations'));
    if (tables.length) {
      db.exec(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`);
    }
    return;
  }
  // SQLite : suppression dynamique de toutes les tables (robuste à l'ajout de tables V2/V3)
  db.exec('PRAGMA foreign_keys = OFF;');
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as any[];
  for (const r of rows) {
    if (keep && r.name === '_migrations') continue;
    db.exec(`DELETE FROM "${r.name}";`);
  }
  db.exec('PRAGMA foreign_keys = ON;');
}

export function nowIso() { return new Date().toISOString(); }

/**
 * Monde de test V1 isolé — construit dans la DB du fichier de test.
 * Merchant A (storeA + closedStore + produits), Merchant B (storeB + produit),
 * clientUser. Retourne les identifiants pour les assertions.
 */
export async function seedWorld(db: any) {
  const hash = await bcrypt.hash('Password123!', 12);

  const mAUser = cuid();
  db.prepare('INSERT INTO users (id, phone, email, passwordHash, role, isPhoneVerified, createdAt, updatedAt) VALUES (?,?,?,?,?,1,?,?)')
    .run(mAUser, '+221770000010', 'ma@test.sn', hash, 'MERCHANT', nowIso(), nowIso());
  const merchantA = cuid();
  db.prepare('INSERT INTO merchants (id, userId, businessName, createdAt, updatedAt) VALUES (?,?,?,?,?)')
    .run(merchantA, mAUser, 'Merchant A', nowIso(), nowIso());

  const mBUser = cuid();
  db.prepare('INSERT INTO users (id, phone, email, passwordHash, role, isPhoneVerified, createdAt, updatedAt) VALUES (?,?,?,?,?,1,?,?)')
    .run(mBUser, '+221770000020', 'mb@test.sn', hash, 'MERCHANT', nowIso(), nowIso());
  const merchantB = cuid();
  db.prepare('INSERT INTO merchants (id, userId, businessName, createdAt, updatedAt) VALUES (?,?,?,?,?)')
    .run(merchantB, mBUser, 'Merchant B', nowIso(), nowIso());

  const clientUser = cuid();
  db.prepare('INSERT INTO users (id, phone, email, passwordHash, role, isPhoneVerified, createdAt, updatedAt) VALUES (?,?,?,?,?,1,?,?)')
    .run(clientUser, '+221760000010', 'client@test.sn', hash, 'CLIENT', nowIso(), nowIso());

  const clientUser2 = cuid();
  db.prepare('INSERT INTO users (id, phone, email, passwordHash, role, isPhoneVerified, createdAt, updatedAt) VALUES (?,?,?,?,?,1,?,?)')
    .run(clientUser2, '+221760000020', 'client2@test.sn', hash, 'CLIENT', nowIso(), nowIso());

  const adminUser = cuid();
  db.prepare('INSERT INTO users (id, phone, email, passwordHash, role, isPhoneVerified, createdAt, updatedAt) VALUES (?,?,?,?,?,1,?,?)')
    .run(adminUser, '+221700000010', 'admin@test.sn', hash, 'ADMIN', nowIso(), nowIso());

  const storeA = cuid();
  db.prepare(`INSERT INTO stores (id, merchantId, name, slug, category, latitude, longitude, deliveryFees, digitalStatus, physicalStatus, isVerified, createdAt, updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(storeA, merchantA, 'Boutique A', 'boutique-a', 'Alimentaire', 14.78, -17.38, 1000, 'OPEN', 'OPEN', 1, nowIso(), nowIso());

  const closedStore = cuid();
  db.prepare(`INSERT INTO stores (id, merchantId, name, slug, digitalStatus, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)`)
    .run(closedStore, merchantA, 'Boutique Fermée', 'boutique-fermee', 'CLOSED', nowIso(), nowIso());

  const storeB = cuid();
  db.prepare(`INSERT INTO stores (id, merchantId, name, slug, digitalStatus, latitude, longitude, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(storeB, merchantB, 'Boutique B', 'boutique-b', 'OPEN', 14.79, -17.39, nowIso(), nowIso());

  const cat = cuid();
  db.prepare('INSERT INTO categories (id, name, slug, createdAt) VALUES (?,?,?,?)').run(cat, 'Alimentaire Test', 'alimentaire-test', nowIso());

  function product(storeId: string, name: string, price: number, stock: number, opts: any = {}) {
    const pid = cuid();
    db.prepare(`INSERT INTO products (id, storeId, name, slug, price, costPrice, categoryId, isActive, isOnline, lowStockThreshold, sku, barcode, createdAt, updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(pid, storeId, name, name.toLowerCase().replace(/\s+/g, '-'), price, opts.costPrice ?? null,
        opts.categoryId ?? null, opts.isActive === false ? 0 : 1, opts.isOnline === false ? 0 : 1,
        opts.threshold ?? 5, opts.sku ?? null, opts.barcode ?? null, nowIso(), nowIso());
    db.prepare('INSERT INTO inventories (id, storeId, productId, quantity, createdAt, updatedAt) VALUES (?,?,?,?,?,?)')
      .run(cuid(), storeId, pid, stock, nowIso(), nowIso());
    if (stock !== 0) {
      db.prepare('INSERT INTO inventory_movements (id, storeId, productId, quantity, type, reason, createdAt) VALUES (?,?,?,?,?,?,?)')
        .run(cuid(), storeId, pid, stock, 'INITIAL', 'Test seed', nowIso());
    }
    return pid;
  }

  const pRiz = product(storeA, 'Riz 25kg', 15000, 20, { threshold: 5, barcode: '3000000000015', sku: 'RIZ25' });
  const pSucre = product(storeA, 'Sucre 1kg', 800, 3, { threshold: 5 }); // sous seuil
  const pOffline = product(storeA, 'Produit Hors Ligne', 1000, 10, { isOnline: false });
  const pClosed = product(closedStore, 'Produit Boutique Fermee', 900, 5);
  const pB = product(storeB, 'Produit B', 500, 50, { threshold: 10 });

  return { hash, mAUser, merchantA, mBUser, merchantB, clientUser, clientUser2, adminUser, storeA, closedStore, storeB, cat, pRiz, pSucre, pOffline, pClosed, pB, product };
}

export interface Http {
  (method: string, path: string, opts?: { token?: string; body?: any; cookie?: string }): Promise<{ status: number; data: any }>;
  port: number;
  close(): Promise<void>;
}

/** Monte l'API sur un port éphémère pour les tests E2E. */
export async function startApi(): Promise<Http> {
  const { buildApp } = await import('../app');
  const app = buildApp();
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', () => r(null)));
  const port = (server.address() as any).port;
  const http = (async (method: string, path: string, opts: any = {}) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.cookie) headers.Cookie = opts.cookie;
    const res = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    let data: any = null;
    try { data = await res.json(); } catch { /* pas de body */ }
    return { status: res.status, data };
  }) as Http;
  http.port = port;
  http.close = async () => { await new Promise((r) => server.close(() => r(null))); };
  return http;
}
