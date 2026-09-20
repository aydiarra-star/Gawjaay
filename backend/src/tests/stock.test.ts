import { describe, it, expect, beforeAll } from 'vitest';
import db, { cuid, initDb } from '../lib/db';
import { resetDatabase } from './helpers';

function nowIso(){ return new Date().toISOString(); }

beforeAll(()=>{
  initDb();
  resetDatabase(db);
  const userId = cuid();
  db.prepare('INSERT INTO users (id, phone, passwordHash, role, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(userId, '+221test', 'hash', 'MERCHANT', nowIso(), nowIso());
  const merchantId = cuid();
  db.prepare('INSERT INTO merchants (id, userId, createdAt, updatedAt) VALUES (?,?,?,?)').run(merchantId, userId, nowIso(), nowIso());
  const storeId = cuid();
  db.prepare('INSERT INTO stores (id, merchantId, name, slug, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(storeId, merchantId, 'Test Store', 'test-store', nowIso(), nowIso());
  const productId = cuid();
  db.prepare('INSERT INTO products (id, storeId, name, slug, price, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)').run(productId, storeId, 'Test Product', 'test-product', 1000, nowIso(), nowIso());
  db.prepare('INSERT INTO inventories (id, storeId, productId, quantity, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(cuid(), storeId, productId, 10, nowIso(), nowIso());
});

describe('Stock unique source de vérité', ()=>{
  it('devrait empêcher vente si stock insuffisant', async ()=>{
    const inv = db.prepare('SELECT * FROM inventories LIMIT 1').get() as any;
    expect(inv.quantity).toBe(10);
    const { adjustStock } = await import('../modules/inventory/service');
    await expect(adjustStock(inv.storeId, inv.productId, -15, 'SALE', 'test', 'user')).rejects.toThrow('Stock insuffisant');
  });

  it('devrait décrémenter stock correctement', async ()=>{
    const inv = db.prepare('SELECT * FROM inventories LIMIT 1').get() as any;
    const { adjustStock } = await import('../modules/inventory/service');
    const res = await adjustStock(inv.storeId, inv.productId, -3, 'SALE', 'vente test', 'user');
    expect(res.inventory.quantity).toBe(7);
    const movements = db.prepare('SELECT * FROM inventory_movements WHERE productId = ?').all(inv.productId) as any[];
    expect(movements.length).toBeGreaterThan(0);
    expect(movements[0].quantity).toBe(-3);
  });
});
