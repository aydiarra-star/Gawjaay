-- GawJaay V2 — migration 003_lot_c (portage PostgreSQL 1:1 de 003_lot_c.ts)
-- Contenu : favoris/fidélité/pointsToUse

CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        targetType TEXT NOT NULL CHECK (targetType IN ('PRODUCT','STORE')),
        targetId TEXT NOT NULL,
        createdAt TEXT DEFAULT (now()::text),
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
        createdAt TEXT DEFAULT (now()::text),
        updatedAt TEXT DEFAULT (now()::text),
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
        createdAt TEXT DEFAULT (now()::text),
        FOREIGN KEY (accountId) REFERENCES loyalty_accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_loyalty_tx_account ON loyalty_transactions(accountId, createdAt);

      ALTER TABLE stores ADD COLUMN loyaltyEnabled INTEGER DEFAULT 0;
      ALTER TABLE stores ADD COLUMN loyaltyEarnRate INTEGER DEFAULT 10;
      ALTER TABLE stores ADD COLUMN loyaltyRedeemValue INTEGER DEFAULT 10;

      -- traçabilité du rachat de points sur commandes et ventes
      ALTER TABLE orders ADD COLUMN pointsToUse INTEGER;
      ALTER TABLE sales ADD COLUMN pointsToUse INTEGER;
