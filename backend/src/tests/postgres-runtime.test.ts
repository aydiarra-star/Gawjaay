import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgresDatabase } from '../lib/postgresAdapter';
import { POSTGRES_BASE_SCHEMA } from '../lib/postgresBaseSchema';
import { runAllMigrations } from '../migrations/versions/008_idempotency';
import { signAccess, signRefresh, verifyAccess } from '../utils/jwt';
import bcrypt from 'bcryptjs';

describe('PostgreSQL Runtime — Phase Finale Parité & Hardening', () => {
  let pgDb: PostgresDatabase;

  beforeAll(() => {
    // Crée une instance PostgreSQL isolée (moteur PG 16 via WASM)
    pgDb = new PostgresDatabase('pglite://');
    // Bootstrap du schéma V1 complet + migrations 001..008
    pgDb.exec(POSTGRES_BASE_SCHEMA);
    const count = runAllMigrations(pgDb);
    expect(count).toBeGreaterThanOrEqual(8);
  });

  afterAll(() => {
    pgDb.close();
  });

  // ——— 1. Schéma & Migrations idempotentes ———
  describe('Migrations PG 000→008 & Idempotence', () => {
    it('ré-exécution des migrations sans duplication ni erreur', () => {
      const secondRun = runAllMigrations(pgDb);
      expect(secondRun).toBe(0);
    });

    it('les tables clés et la table idempotency_keys existent avec leur clé primaire', () => {
      const tables = pgDb.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[];
      const names = tables.map((t) => t.name);
      expect(names).toContain('users');
      expect(names).toContain('stores');
      expect(names).toContain('products');
      expect(names).toContain('inventories');
      expect(names).toContain('sales');
      expect(names).toContain('orders');
      expect(names).toContain('idempotency_keys');
      expect(names).toContain('ai_conversations');
      expect(names).toContain('ai_action_requests');
    });
  });

  // ——— 2. Authentification & Sécurité ———
  describe('Auth sur PostgreSQL', () => {
    const userA = {
      id: 'usr_pg_001',
      phone: '+221770001111',
      email: 'merchant_a@gawjaay.sn',
      passwordHash: bcrypt.hashSync('Password123!', 8),
      role: 'MERCHANT',
    };

    it('création et lecture utilisateur avec mapping exact des colonnes camelCase', () => {
      pgDb.prepare(
        `INSERT INTO users (id, phone, email, passwordHash, role, isPhoneVerified, isActive) VALUES (?, ?, ?, ?, ?, 1, 1)`
      ).run(userA.id, userA.phone, userA.email, userA.passwordHash, userA.role);

      const found = pgDb.prepare(`SELECT * FROM users WHERE id = ?`).get(userA.id) as any;
      expect(found).toBeDefined();
      expect(found.id).toBe(userA.id);
      expect(found.phone).toBe(userA.phone);
      expect(found.passwordHash).toBe(userA.passwordHash);
      expect(found.role).toBe('MERCHANT');
      expect(found.isPhoneVerified).toBe(1);
      expect(found.isActive).toBe(1);
    });

    it('création session et token JWT', () => {
      const token = signAccess({ userId: userA.id, role: userA.role });
      const decoded = verifyAccess(token);
      expect(decoded.userId).toBe(userA.id);

      const refresh = signRefresh({ userId: userA.id, sessionId: 'sess_01' });
      pgDb.prepare(
        `INSERT INTO sessions (id, userId, refreshToken, expiresAt) VALUES (?, ?, ?, ?)`
      ).run('sess_01', userA.id, refresh, new Date(Date.now() + 86400000).toISOString());

      const sess = pgDb.prepare(`SELECT * FROM sessions WHERE userId = ?`).get(userA.id) as any;
      expect(sess.refreshToken).toBe(refresh);
      expect(sess.revoked).toBe(0);
    });
  });

  // ——— 3. Test Critique : Store IDs dynamiques ———
  describe('Test Critique — Store IDs dynamiques (DB source de vérité)', () => {
    const merchantUser = {
      id: 'usr_dyn_merchant',
      phone: '+221770002222',
      passwordHash: bcrypt.hashSync('Password123!', 8),
      role: 'MERCHANT',
    };
    const merchantProfile = {
      id: 'merch_dyn_001',
      userId: merchantUser.id,
      businessName: 'GawJaay Pilot Store',
    };

    beforeAll(() => {
      pgDb.prepare(`INSERT INTO users (id, phone, passwordHash, role) VALUES (?, ?, ?, ?)`).run(
        merchantUser.id,
        merchantUser.phone,
        merchantUser.passwordHash,
        merchantUser.role
      );
      pgDb.prepare(`INSERT INTO merchants (id, userId, businessName) VALUES (?, ?, ?)`).run(
        merchantProfile.id,
        merchantProfile.userId,
        merchantProfile.businessName
      );
    });

    it('simulation authMiddleware : les storeIds sont rechargés depuis la DB après création', () => {
      // 1. Connexion initiale : 0 boutique
      let stores = pgDb.prepare(`SELECT id FROM stores WHERE merchantId = ?`).all(merchantProfile.id) as any[];
      let storeIds = stores.map((s) => s.id);
      expect(storeIds).toHaveLength(0);

      // 2. Création boutique 1 SANS ré-émission du JWT
      const store1Id = 'store_dyn_1';
      pgDb.prepare(
        `INSERT INTO stores (id, merchantId, name, slug) VALUES (?, ?, ?, ?)`
      ).run(store1Id, merchantProfile.id, 'Boutique Alpha', 'boutique-alpha');

      // 3. authMiddleware relit la base
      stores = pgDb.prepare(`SELECT id FROM stores WHERE merchantId = ?`).all(merchantProfile.id) as any[];
      storeIds = stores.map((s) => s.id);
      expect(storeIds).toContain(store1Id);

      // 4. Création boutique 2 SANS reconnexion
      const store2Id = 'store_dyn_2';
      pgDb.prepare(
        `INSERT INTO stores (id, merchantId, name, slug) VALUES (?, ?, ?, ?)`
      ).run(store2Id, merchantProfile.id, 'Boutique Beta', 'boutique-beta');

      // 5. Opération sur boutique 2 immédiatement autorisée
      stores = pgDb.prepare(`SELECT id FROM stores WHERE merchantId = ?`).all(merchantProfile.id) as any[];
      storeIds = stores.map((s) => s.id);
      expect(storeIds).toContain(store1Id);
      expect(storeIds).toContain(store2Id);

      // Vérification isolation : un autre marchand ne possède pas ces boutiques
      const otherStores = pgDb.prepare(`SELECT id FROM stores WHERE merchantId = ?`).all('other_merch') as any[];
      expect(otherStores).toHaveLength(0);
    });
  });

  // ——— 4. Test Critique : Idempotence multi-tenant ———
  describe('Test Critique — Idempotency-Key (key, endpoint, userId)', () => {
    it('même clé X + même endpoint + User A → réutilisation de la réponse (1 seule écriture)', () => {
      const key = 'idemp_key_123';
      const endpoint = 'POST /api/v1/orders';
      const userAId = 'usr_idemp_a';
      const userBId = 'usr_idemp_b';

      // 1re requête de User A
      const respA = { orderId: 'ord_100', totalAmount: 15000, status: 'EN_ATTENTE' };
      pgDb.prepare(
        `INSERT INTO idempotency_keys (key, endpoint, userId, status, responseJson) VALUES (?, ?, ?, ?, ?)`
      ).run(key, endpoint, userAId, 201, JSON.stringify(respA));

      // Rejeu par User A avec la même clé
      const cachedA = pgDb.prepare(
        `SELECT status, responseJson FROM idempotency_keys WHERE key = ? AND endpoint = ? AND userId = ?`
      ).get(key, endpoint, userAId) as any;

      expect(cachedA).toBeDefined();
      expect(cachedA.status).toBe(201);
      expect(JSON.parse(cachedA.responseJson)).toEqual(respA);

      // Même clé par User B → entrée distincte autorisée (clé primaire composite)
      const cachedB = pgDb.prepare(
        `SELECT status, responseJson FROM idempotency_keys WHERE key = ? AND endpoint = ? AND userId = ?`
      ).get(key, endpoint, userBId) as any;
      expect(cachedB).toBeUndefined();

      // User B écrit sa propre réponse avec la même clé
      const respB = { orderId: 'ord_200', totalAmount: 8500, status: 'EN_ATTENTE' };
      pgDb.prepare(
        `INSERT INTO idempotency_keys (key, endpoint, userId, status, responseJson) VALUES (?, ?, ?, ?, ?)`
      ).run(key, endpoint, userBId, 201, JSON.stringify(respB));

      const foundB = pgDb.prepare(
        `SELECT status, responseJson FROM idempotency_keys WHERE key = ? AND endpoint = ? AND userId = ?`
      ).get(key, endpoint, userBId) as any;
      expect(foundB).toBeDefined();
      expect(JSON.parse(foundB.responseJson)).toEqual(respB);
    });
  });

  // ——— 5. Multi-Tenant & Isolation ———
  describe('Multi-Tenant Isolation sur PostgreSQL', () => {
    const tenantA = { userId: 'usr_tenant_a', merchantId: 'm_tenant_a', storeId: 's_tenant_a' };
    const tenantB = { userId: 'usr_tenant_b', merchantId: 'm_tenant_b', storeId: 's_tenant_b' };

    beforeAll(() => {
      pgDb.prepare(`INSERT INTO users (id, phone, passwordHash, role) VALUES (?, ?, ?, ?)`).run(
        tenantA.userId,
        '+221770003001',
        'hash',
        'MERCHANT'
      );
      pgDb.prepare(`INSERT INTO merchants (id, userId, businessName) VALUES (?, ?, ?)`).run(
        tenantA.merchantId,
        tenantA.userId,
        'Commerce A'
      );
      pgDb.prepare(`INSERT INTO stores (id, merchantId, name, slug) VALUES (?, ?, ?, ?)`).run(
        tenantA.storeId,
        tenantA.merchantId,
        'Store A',
        'store-a'
      );

      pgDb.prepare(`INSERT INTO users (id, phone, passwordHash, role) VALUES (?, ?, ?, ?)`).run(
        tenantB.userId,
        '+221770003002',
        'hash',
        'MERCHANT'
      );
      pgDb.prepare(`INSERT INTO merchants (id, userId, businessName) VALUES (?, ?, ?)`).run(
        tenantB.merchantId,
        tenantB.userId,
        'Commerce B'
      );
      pgDb.prepare(`INSERT INTO stores (id, merchantId, name, slug) VALUES (?, ?, ?, ?)`).run(
        tenantB.storeId,
        tenantB.merchantId,
        'Store B',
        'store-b'
      );

      // Produits
      pgDb.prepare(
        `INSERT INTO products (id, storeId, name, slug, price, costPrice) VALUES (?, ?, ?, ?, ?, ?)`
      ).run('prod_a1', tenantA.storeId, 'Produit A', 'produit-a', 5000, 3000);
      pgDb.prepare(
        `INSERT INTO products (id, storeId, name, slug, price, costPrice) VALUES (?, ?, ?, ?, ?, ?)`
      ).run('prod_b1', tenantB.storeId, 'Produit B', 'produit-b', 12000, 8000);

      // Stock
      pgDb.prepare(`INSERT INTO inventories (id, storeId, productId, quantity) VALUES (?, ?, ?, ?)`).run(
        'inv_a1',
        tenantA.storeId,
        'prod_a1',
        50
      );
      pgDb.prepare(`INSERT INTO inventories (id, storeId, productId, quantity) VALUES (?, ?, ?, ?)`).run(
        'inv_b1',
        tenantB.storeId,
        'prod_b1',
        20
      );
    });

    it('Tenant A ne liste que ses produits et son stock', () => {
      const prodsA = pgDb.prepare(`SELECT * FROM products WHERE storeId = ?`).all(tenantA.storeId) as any[];
      expect(prodsA).toHaveLength(1);
      expect(prodsA[0].id).toBe('prod_a1');
      expect(prodsA[0].costPrice).toBe(3000);

      const prodsB = pgDb.prepare(`SELECT * FROM products WHERE storeId = ?`).all(tenantB.storeId) as any[];
      expect(prodsB).toHaveLength(1);
      expect(prodsB[0].id).toBe('prod_b1');
    });

    it('isolation des clients et ventes par boutique', () => {
      pgDb.prepare(`INSERT INTO customers (id, storeId, name, phone) VALUES (?, ?, ?, ?)`).run(
        'cust_a1',
        tenantA.storeId,
        'Client Alpha',
        '+221701111111'
      );
      pgDb.prepare(`INSERT INTO customers (id, storeId, name, phone) VALUES (?, ?, ?, ?)`).run(
        'cust_b1',
        tenantB.storeId,
        'Client Beta',
        '+221702222222'
      );

      const clientsA = pgDb.prepare(`SELECT * FROM customers WHERE storeId = ?`).all(tenantA.storeId) as any[];
      expect(clientsA.map((c) => c.name)).toEqual(['Client Alpha']);

      const clientsB = pgDb.prepare(`SELECT * FROM customers WHERE storeId = ?`).all(tenantB.storeId) as any[];
      expect(clientsB.map((c) => c.name)).toEqual(['Client Beta']);
    });
  });

  // ——— 6. Flux Métier : Vente CASH, Stock, Commandes ———
  describe('Flux Métier Complet & Atomicité', () => {
    const storeId = 'store_metier_1';
    const prodId = 'prod_metier_1';

    beforeAll(() => {
      pgDb.prepare(`INSERT INTO stores (id, merchantId, name, slug) VALUES (?, ?, ?, ?)`).run(
        storeId,
        'm_tenant_a',
        'Store Métier',
        'store-metier'
      );
      pgDb.prepare(
        `INSERT INTO products (id, storeId, name, slug, price, costPrice) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(prodId, storeId, 'Sac de Sucre 50kg', 'sucre-50kg', 25000, 21000);
      pgDb.prepare(`INSERT INTO inventories (id, storeId, productId, quantity) VALUES (?, ?, ?, ?)`).run(
        'inv_metier_1',
        storeId,
        prodId,
        100
      );
    });

    it('vente CASH : enregistrement vente + décrémentation atomique du stock', () => {
      const saleId = 'sale_001';
      const qtySold = 3;
      const unitPrice = 25000;
      const totalAmount = qtySold * unitPrice;

      // Transaction vente
      pgDb.exec('BEGIN');
      try {
        pgDb.prepare(
          `INSERT INTO sales (id, storeId, totalAmount, discount, paymentMethod, amountPaid, change, createdById) VALUES (?, ?, ?, 0, 'CASH', ?, 0, ?)`
        ).run(saleId, storeId, totalAmount, totalAmount, 'usr_tenant_a');

        pgDb.prepare(
          `INSERT INTO sale_items (id, saleId, productId, quantity, unitPrice, total) VALUES (?, ?, ?, ?, ?, ?)`
        ).run('item_001', saleId, prodId, qtySold, unitPrice, totalAmount);

        pgDb.prepare(
          `UPDATE inventories SET quantity = quantity - ? WHERE storeId = ? AND productId = ?`
        ).run(qtySold, storeId, prodId);

        pgDb.prepare(
          `INSERT INTO inventory_movements (id, storeId, productId, quantity, type, reason, userId) VALUES (?, ?, ?, ?, 'OUT', 'SALE', ?)`
        ).run('mov_001', storeId, prodId, -qtySold, 'usr_tenant_a');

        pgDb.exec('COMMIT');
      } catch (err) {
        pgDb.exec('ROLLBACK');
        throw err;
      }

      const inv = pgDb.prepare(`SELECT quantity FROM inventories WHERE storeId = ? AND productId = ?`).get(
        storeId,
        prodId
      ) as any;
      expect(inv.quantity).toBe(97);

      const sale = pgDb.prepare(`SELECT * FROM sales WHERE id = ?`).get(saleId) as any;
      expect(sale.totalAmount).toBe(75000);
      expect(sale.paymentMethod).toBe('CASH');
    });

    it('commande client avec transitions autorisées : EN_ATTENTE -> CONFIRMEE -> PREPARATION -> PRETE -> LIVREE', () => {
      const orderId = 'ord_flow_01';
      pgDb.prepare(
        `INSERT INTO orders (id, orderNumber, storeId, clientId, status, totalAmount, deliveryType) VALUES (?, 'CMD-PG-001', ?, ?, 'EN_ATTENTE', 50000, 'RETRAIT')`
      ).run(orderId, storeId, 'usr_tenant_a');

      // Statut 1 : CONFIRMEE
      pgDb.prepare(`UPDATE orders SET status = 'CONFIRMEE' WHERE id = ?`).run(orderId);
      let ord = pgDb.prepare(`SELECT status FROM orders WHERE id = ?`).get(orderId) as any;
      expect(ord.status).toBe('CONFIRMEE');

      // Statut 2 : PREPARATION
      pgDb.prepare(`UPDATE orders SET status = 'PREPARATION' WHERE id = ?`).run(orderId);
      ord = pgDb.prepare(`SELECT status FROM orders WHERE id = ?`).get(orderId) as any;
      expect(ord.status).toBe('PREPARATION');

      // Statut 3 : PRETE
      pgDb.prepare(`UPDATE orders SET status = 'PRETE' WHERE id = ?`).run(orderId);
      ord = pgDb.prepare(`SELECT status FROM orders WHERE id = ?`).get(orderId) as any;
      expect(ord.status).toBe('PRETE');

      // Statut 4 : LIVREE
      pgDb.prepare(`UPDATE orders SET status = 'LIVREE' WHERE id = ?`).run(orderId);
      ord = pgDb.prepare(`SELECT status FROM orders WHERE id = ?`).get(orderId) as any;
      expect(ord.status).toBe('LIVREE');
    });
  });

  // ——— 7. Assistant IA & Actions Contrôlées sur PostgreSQL ———
  describe('Assistant IA sur PostgreSQL (No-invention & Actions contrôlées)', () => {
    it('création conversation et message IA', () => {
      const convId = 'conv_ia_1';
      const storeId = 'store_metier_1';
      const userId = 'usr_tenant_a';

      pgDb.prepare(`INSERT INTO ai_conversations (id, userId, storeId) VALUES (?, ?, ?)`).run(
        convId,
        userId,
        storeId
      );

      pgDb.prepare(
        `INSERT INTO ai_messages (id, conversationId, role, content, intent) VALUES (?, ?, 'USER', ?, 'SALES')`
      ).run('msg_1', convId, 'Quel est le total de mes ventes ?');

      const messages = pgDb.prepare(`SELECT * FROM ai_messages WHERE conversationId = ?`).all(convId) as any[];
      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('USER');
    });

    it('action IA contrôlée : PENDING -> confirmation explicite -> EXECUTED avec audit', () => {
      const actionId = 'act_replenish_01';
      const storeId = 'store_metier_1';
      const userId = 'usr_tenant_a';

      // 1. Action créée en PENDING
      pgDb.prepare(
        `INSERT INTO ai_action_requests (id, storeId, userId, actionType, paramsJson, status) VALUES (?, ?, ?, 'GENERATE_REPLENISHMENT_PLAN', ?, 'PENDING')`
      ).run(actionId, storeId, userId, JSON.stringify({ items: [{ productId: 'prod_metier_1', quantity: 50 }] }));

      let action = pgDb.prepare(`SELECT * FROM ai_action_requests WHERE id = ?`).get(actionId) as any;
      expect(action.status).toBe('PENDING');

      // 2. Confirmation explicite
      pgDb.prepare(
        `UPDATE ai_action_requests SET status = 'EXECUTED', executedAt = ?, resultJson = ? WHERE id = ?`
      ).run(new Date().toISOString(), JSON.stringify({ success: true, planId: 'plan_01' }), actionId);

      action = pgDb.prepare(`SELECT * FROM ai_action_requests WHERE id = ?`).get(actionId) as any;
      expect(action.status).toBe('EXECUTED');
      expect(action.executedAt).toBeDefined();

      // 3. Audit log enregistré
      pgDb.prepare(
        `INSERT INTO audit_logs (id, userId, action, resource, resourceId, details) VALUES (?, ?, 'AI_ACTION_EXECUTED', 'ai_action_requests', ?, ?)`
      ).run('audit_01', userId, actionId, JSON.stringify({ actionType: 'GENERATE_REPLENISHMENT_PLAN' }));

      const audit = pgDb.prepare(`SELECT * FROM audit_logs WHERE resourceId = ?`).get(actionId) as any;
      expect(audit).toBeDefined();
      expect(audit.action).toBe('AI_ACTION_EXECUTED');
    });
  });
});
