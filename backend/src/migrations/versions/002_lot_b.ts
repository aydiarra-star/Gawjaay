import type { Migration } from '../runner';
import { runMigrations } from '../runner';
import { LOT_A_MIGRATIONS } from './001_lot_a';

/**
 * MIGRATION 002 — LOT B : Codes-barres, Inventaires, Stock avancé.
 *
 * Crée :
 *  - inventory_counts       : sessions d'inventaire (OPEN → CONFIRMED/CANCELLED)
 *  - inventory_count_items  : lignes de comptage (stock système vs compté vs écart)
 *
 * Enrichit (backward-compatible) :
 *  - products.stockMax            : stock maximum (alerte sur-stock)
 *  - index unique code-barres PAR BOUTIQUE : UNIQUE(storeId, barcode) partiel
 *    (les doublons préexistants sont neutralisés : barcode = NULL)
 */
const migration: Migration = {
  name: '002_lot_b_inventaires_barcodes_stock_avance',
  up: (db: any) => {
    // dédoublonne les codes-barres préexistants (garde le plus ancien par boutique)
    db.exec(`
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
    `);
  },
};

export const LOT_B_MIGRATIONS: Migration[] = [migration];

/** Applique toutes les migrations connues, dans l'ordre (idempotent). */
export function runAllMigrations(database?: any) {
  return runMigrations(database, [...LOT_A_MIGRATIONS, ...LOT_B_MIGRATIONS]);
}
