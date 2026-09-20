-- GawJaay V2 — migration 002_lot_b (portage PostgreSQL 1:1 de 002_lot_b.ts)
-- Contenu : codes-barres uniques/inventaires/stockMax

UPDATE products SET barcode = NULL
      WHERE id NOT IN (
        SELECT MIN(id) FROM products WHERE barcode IS NOT NULL GROUP BY storeId, barcode
      ) AND barcode IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique
        ON products(storeId, barcode) WHERE barcode IS NOT NULL;

      ALTER TABLE products ADD COLUMN stockMax INTEGER;

      CREATE TABLE IF NOT EXISTS inventory_counts (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        merchantId TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CONFIRMED','CANCELLED')),
        startedBy TEXT NOT NULL,
        confirmedBy TEXT,
        notes TEXT,
        startedAt TEXT NOT NULL,
        confirmedAt TEXT,
        FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS inventory_count_items (
        id TEXT PRIMARY KEY,
        countId TEXT NOT NULL,
        productId TEXT NOT NULL,
        productName TEXT,
        systemQty REAL NOT NULL,
        countedQty REAL,
        difference REAL,
        UNIQUE(countId, productId),
        FOREIGN KEY (countId) REFERENCES inventory_counts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_counts_store ON inventory_counts(storeId, status);
