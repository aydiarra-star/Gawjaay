import type { Migration } from '../runner';
import { runMigrations } from '../runner';
import { LOT_A_MIGRATIONS } from './001_lot_a';
import { LOT_B_MIGRATIONS } from './002_lot_b';
import { LOT_C_MIGRATIONS } from './003_lot_c';

/**
 * MIGRATION 004 — LOT D : B2B (grossistes, catalogues pro, commandes) + réapprovisionnement.
 *
 * Principe : PAS de second système de stock. Un catalogue B2B expose les produits
 * réels de la boutique du grossiste (stock unique). Les prix pro et minimums de
 * commande sont déclaratifs (catalogue), les quantités partent du stock réel.
 *
 * Machine à états commande B2B (validée serveur) :
 * BROUILLON → ENVOYEE → ACCEPTEE → PREPARATION → PRETE → EXPEDIEE → RECUE
 *                                   ↘ ANNULEE (depuis ENVOYEE/ACCEPTEE)
 */
const migration: Migration = {
  name: '004_lot_d_b2b_reapprovisionnement',
  up: (db: any) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS b2b_profiles (
        id TEXT PRIMARY KEY,
        userId TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('WHOLESALER','SUPPLIER','BOTH')),
        companyName TEXT NOT NULL,
        ninea TEXT,
        phone TEXT,
        isActive INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS b2b_catalogs (
        id TEXT PRIMARY KEY,
        wholesalerUserId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        minOrderAmount REAL NOT NULL DEFAULT 0,
        isActive INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (wholesalerUserId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS b2b_catalog_items (
        id TEXT PRIMARY KEY,
        catalogId TEXT NOT NULL,
        productId TEXT NOT NULL,
        proPrice REAL NOT NULL,
        minQty INTEGER NOT NULL DEFAULT 1,
        UNIQUE(catalogId, productId),
        FOREIGN KEY (catalogId) REFERENCES b2b_catalogs(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS b2b_orders (
        id TEXT PRIMARY KEY,
        orderNumber TEXT UNIQUE NOT NULL,
        catalogId TEXT,
        wholesalerUserId TEXT NOT NULL,
        buyerMerchantId TEXT NOT NULL,
        buyerStoreId TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'BROUILLON'
          CHECK (status IN ('BROUILLON','ENVOYEE','ACCEPTEE','PREPARATION','PRETE','EXPEDIEE','RECUE','ANNULEE')),
        totalAmount REAL NOT NULL DEFAULT 0,
        notes TEXT,
        statusHistory TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (buyerStoreId) REFERENCES stores(id)
      );
      CREATE TABLE IF NOT EXISTS b2b_order_items (
        id TEXT PRIMARY KEY,
        orderId TEXT NOT NULL,
        productId TEXT NOT NULL,
        productName TEXT,
        quantity REAL NOT NULL,
        proPrice REAL NOT NULL,
        total REAL NOT NULL,
        FOREIGN KEY (orderId) REFERENCES b2b_orders(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_b2b_orders_wholesaler ON b2b_orders(wholesalerUserId, status);
      CREATE INDEX IF NOT EXISTS idx_b2b_orders_buyer ON b2b_orders(buyerMerchantId, status);

      CREATE TABLE IF NOT EXISTS replenishment_suggestions (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        merchantId TEXT NOT NULL,
        productId TEXT NOT NULL,
        currentStock REAL NOT NULL,
        threshold INTEGER NOT NULL,
        suggestedQty INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DISMISSED','ORDERED')),
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
    `);
  },
};

export const LOT_D_MIGRATIONS: Migration[] = [migration];

/** Applique toutes les migrations connues, dans l'ordre (idempotent). */
export function runAllMigrations(database?: any) {
  return runMigrations(database, [...LOT_A_MIGRATIONS, ...LOT_B_MIGRATIONS, ...LOT_C_MIGRATIONS, ...LOT_D_MIGRATIONS]);
}
