import { describe, it, expect, beforeAll } from 'vitest';
import db, { initDb } from '../lib/db';
import * as authService from '../modules/auth/service';

beforeAll(()=>{
  initDb();
  // disable FK for cleanup
  db.exec('PRAGMA foreign_keys = OFF; DELETE FROM sessions; DELETE FROM audit_logs; DELETE FROM notifications; DELETE FROM employees; DELETE FROM deliveries; DELETE FROM payments; DELETE FROM order_items; DELETE FROM orders; DELETE FROM sale_items; DELETE FROM sales; DELETE FROM inventories; DELETE FROM inventory_movements; DELETE FROM products; DELETE FROM stores; DELETE FROM merchants; DELETE FROM users; PRAGMA foreign_keys = ON;');
});

describe('Auth sécurisée', ()=>{
  it('register + login + refresh', async ()=>{
    const reg = await authService.register({ phone: '+221777777777', password: 'Password123!', role: 'CLIENT' });
    expect(reg.user.phone).toBe('+221777777777');
    expect(reg.accessToken).toBeDefined();

    const login = await authService.login('+221777777777', 'Password123!');
    expect(login.accessToken).toBeDefined();

    const refreshed = await authService.refresh(login.refreshToken);
    expect(refreshed.accessToken).toBeDefined();
  });

  it('doit refuser mauvais mot de passe', async ()=>{
    await expect(authService.login('+221777777777', 'wrong')).rejects.toThrow();
  });

  it('doit isoler multi-tenant - merchant ne voit pas autre boutique', async ()=>{
    const reg2 = await authService.register({ phone: '+221888888888', password: 'Password123!', role: 'MERCHANT', name: 'Boutique 2' });
    const merchant2 = db.prepare('SELECT * FROM merchants WHERE userId = ?').get(reg2.user.id) as any;
    expect(merchant2).toBeDefined();
    const { createStore } = await import('../modules/stores/service');
    const store = await createStore({ userId: reg2.user.id, merchantId: merchant2.id, role: 'MERCHANT', storeIds: [] }, { name: 'Boutique Isolée' });
    expect(store.slug).toBeDefined();

    const { getStoreById } = await import('../modules/stores/service');
    await expect(getStoreById(store.id, { userId: 'other', merchantId: 'other-merchant', role: 'MERCHANT', storeIds: [] })).rejects.toThrow('Accès refusé');
  });
});
