import type { Migration } from '../runner';
import { runMigrations } from '../runner';
import { LOT_A_MIGRATIONS } from './001_lot_a';
import { LOT_B_MIGRATIONS } from './002_lot_b';

/**
 * MIGRATION 003 — LOT C : Favoris, Fidélité.
 *
 * Crée :
 *  - favorites             : favoris produits/boutiques d'un client
 *  - loyalty_accounts      : compte points par (boutique, client)
 *  - loyalty_transactions  : historique obligatoire des points (EARN/REDEEM/ADJUST)
 *
 * Enrichit (backward-compatible) :
 *  - stores.loyaltyEnabled    : programme activé par boutique (optionnel)
 *  - stores.loyaltyEarnRate   : points gagnés par tranche de 1000 FCFA (défaut 10)
 *  - stores.loyaltyRedeemValue: valeur d'1 point en FCFA au rachat (défaut 10)
 */
const migration: Migration = {
  name: '003_lot_c_favoris_fidelite',
  up: (db: any) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        targetType TEXT NOT NULL CHECK (targetType IN ('PRODUCT','STORE')),
        targetId TEXT NOT NULL,
        createdAt TEXT DEFAULT (datetime('now')),
        UNIQUE(userId, targetType, targetId),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(userId, targetType);

      CREATE TABLE IF NOT EXISTS loyalty_accounts (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        clientUserId TEXT NOT NULL,
        customerId TEXT,
        points INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now')),
        UNIQUE(storeId, clientUserId),
        FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('EARN','REDEEM','ADJUST')),
        points INTEGER NOT NULL,
        balanceAfter INTEGER NOT NULL,
        referenceId TEXT,
        reason TEXT,
        createdBy TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (accountId) REFERENCES loyalty_accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_loyalty_tx_account ON loyalty_transactions(accountId, createdAt);

      ALTER TABLE stores ADD COLUMN loyaltyEnabled INTEGER DEFAULT 0;
      ALTER TABLE stores ADD COLUMN loyaltyEarnRate INTEGER DEFAULT 10;
      ALTER TABLE stores ADD COLUMN loyaltyRedeemValue INTEGER DEFAULT 10;

      -- traçabilité du rachat de points sur commandes et ventes
      ALTER TABLE orders ADD COLUMN pointsToUse INTEGER;
      ALTER TABLE sales ADD COLUMN pointsToUse INTEGER;
    `);
  },
};

export const LOT_C_MIGRATIONS: Migration[] = [migration];

/** Applique toutes les migrations connues, dans l'ordre (idempotent). */
export function runAllMigrations(database?: any) {
  return runMigrations(database, [...LOT_A_MIGRATIONS, ...LOT_B_MIGRATIONS, ...LOT_C_MIGRATIONS]);
}
