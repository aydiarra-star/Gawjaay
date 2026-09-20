-- GawJaay V2 — migration 004_lot_d (portage PostgreSQL 1:1 de 004_lot_d.ts)
-- Contenu : B2B/réapprovisionnement

CREATE TABLE IF NOT EXISTS b2b_profiles (
        id TEXT PRIMARY KEY,
        userId TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('WHOLESALER','SUPPLIER','BOTH')),
        companyName TEXT NOT NULL,
        ninea TEXT,
        phone TEXT,
        isActive INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT (now()::text),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS b2b_catalogs (
        id TEXT PRIMARY KEY,
        wholesalerUserId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        minOrderAmount REAL NOT NULL DEFAULT 0,
        isActive INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT (now()::text),
        updatedAt TEXT DEFAULT (now()::text),
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
        createdAt TEXT DEFAULT (now()::text),
        updatedAt TEXT DEFAULT (now()::text),
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
        createdAt TEXT DEFAULT (now()::text),
        FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
