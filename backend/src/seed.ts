import db, { cuid, initDb } from './lib/db';
import bcrypt from 'bcryptjs';
import { seedRegions } from './modules/regions/service';

function nowIso(){ return new Date().toISOString(); }

async function main() {
  initDb();
  console.log('Seeding GawJaay SQLite...');

  await seedRegions();
  console.log('Regions seeded');

  const hash = await bcrypt.hash('Password123!', 12);

  // Admin
  let admin = db.prepare('SELECT * FROM users WHERE phone = ?').get('+221700000001') as any;
  if (!admin) {
    const id = cuid();
    db.prepare('INSERT INTO users (id, phone, email, passwordHash, role, isPhoneVerified, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, '+221700000001', 'admin@gawjaay.sn', hash, 'ADMIN', 1, nowIso(), nowIso());
    admin = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  // Merchant
  let merchantUser = db.prepare('SELECT * FROM users WHERE phone = ?').get('+221770000001') as any;
  if (!merchantUser) {
    const id = cuid();
    db.prepare('INSERT INTO users (id, phone, email, passwordHash, role, isPhoneVerified, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, '+221770000001', 'merchant@demo.sn', hash, 'MERCHANT', 1, nowIso(), nowIso());
    merchantUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  let merchant = db.prepare('SELECT * FROM merchants WHERE userId = ?').get(merchantUser.id) as any;
  if (!merchant) {
    const mid = cuid();
    db.prepare('INSERT INTO merchants (id, userId, businessName, createdAt, updatedAt) VALUES (?,?,?,?,?)')
      .run(mid, merchantUser.id, 'DEMO Boutique Dakar', nowIso(), nowIso());
    merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(mid);
  }

  // Client
  let clientUser = db.prepare('SELECT * FROM users WHERE phone = ?').get('+221760000001') as any;
  if (!clientUser) {
    const id = cuid();
    db.prepare('INSERT INTO users (id, phone, email, passwordHash, role, isPhoneVerified, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, '+221760000001', 'client@demo.sn', hash, 'CLIENT', 1, nowIso(), nowIso());
    clientUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  // Store
  let store = db.prepare('SELECT * FROM stores WHERE merchantId = ?').get(merchant.id) as any;
  if (!store) {
    const sid = cuid();
    db.prepare(`INSERT INTO stores (id, merchantId, name, slug, description, category, phone, whatsapp, addressText, quartier, latitude, longitude, deliveryFees, allowPickup, allowDelivery, isVerified, createdAt, updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(sid, merchant.id, 'DEMO Épicerie Keur Massar', 'demo-epicerie-keur-massar', 'Boutique de démonstration - Dakar', 'Alimentaire', '+221770000001', '+221770000001', 'Keur Massar, Dakar', 'Keur Massar', 14.7833, -17.3833, 1000, 1, 1, 1, nowIso(), nowIso());
    store = db.prepare('SELECT * FROM stores WHERE id = ?').get(sid);
  }

  // Categories
  let catAlim = db.prepare('SELECT * FROM categories WHERE slug = ?').get('alimentaire') as any;
  if (!catAlim) {
    const cid = cuid();
    db.prepare('INSERT INTO categories (id, name, slug, createdAt) VALUES (?,?,?,?)').run(cid, 'Alimentaire', 'alimentaire', nowIso());
    catAlim = db.prepare('SELECT * FROM categories WHERE id = ?').get(cid);
  }
  let catBoisson = db.prepare('SELECT * FROM categories WHERE slug = ?').get('boissons') as any;
  if (!catBoisson) {
    const cid = cuid();
    db.prepare('INSERT INTO categories (id, name, slug, createdAt) VALUES (?,?,?,?)').run(cid, 'Boissons', 'boissons', nowIso());
    catBoisson = db.prepare('SELECT * FROM categories WHERE id = ?').get(cid);
  }

  const productsData = [
    { name: 'Riz 25kg', price: 15000, costPrice: 13000, cat: catAlim.id, stock: 20 },
    { name: 'Huile 1L', price: 1200, costPrice: 1000, cat: catAlim.id, stock: 50 },
    { name: 'Sucre 1kg', price: 800, costPrice: 650, cat: catAlim.id, stock: 3 },
    { name: 'Lait en poudre 500g', price: 2500, costPrice: 2000, cat: catAlim.id, stock: 15 },
  ];

  for (const pd of productsData) {
    let prod = db.prepare('SELECT * FROM products WHERE storeId = ? AND name = ?').get(store.id, pd.name) as any;
    if (!prod) {
      const pid = cuid();
      db.prepare(`INSERT INTO products (id, storeId, name, slug, price, costPrice, categoryId, isActive, isOnline, createdAt, updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(pid, store.id, pd.name, pd.name.toLowerCase().replace(/\s+/g,'-')+'-demo', pd.price, pd.costPrice, pd.cat, 1, 1, nowIso(), nowIso());
      db.prepare('INSERT INTO inventories (id, storeId, productId, quantity, createdAt, updatedAt) VALUES (?,?,?,?,?,?)')
        .run(cuid(), store.id, pid, pd.stock, nowIso(), nowIso());
      db.prepare('INSERT INTO inventory_movements (id, storeId, productId, quantity, type, reason, createdAt) VALUES (?,?,?,?,?,?,?)')
        .run(cuid(), store.id, pid, pd.stock, 'INITIAL', 'Seed demo', nowIso());
    }
  }

  let customer = db.prepare('SELECT * FROM customers WHERE storeId = ? AND phone = ?').get(store.id, '+221760000001') as any;
  if (!customer) {
    const cid = cuid();
    db.prepare('INSERT INTO customers (id, storeId, name, phone, address, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)')
      .run(cid, store.id, 'Client Démo', '+221760000001', 'Dakar', nowIso(), nowIso());
  }

  console.log('Seed completed');
  console.log({ admin: '+221700000001', merchant: '+221770000001', client: '+221760000001', store: store.slug });
}

main();
