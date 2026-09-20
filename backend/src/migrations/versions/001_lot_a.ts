import { runMigrations } from '../runner';
import type { Migration } from '../runner';

/**
 * MIGRATION 001 — LOT A : Promotions, Coupons, Avis vérifiés, Modération.
 *
 * Crée :
 *  - promotions            : campagnes commerciales par boutique (PERCENT/FIXED/PROMO_PRICE)
 *  - promotion_products    : périmètre produits d'une promotion (vide = toute la boutique)
 *  - coupons               : codes promo par boutique (code unique par boutique)
 *  - coupon_redemptions    : historique anti-double utilisation (unique couponId+orderId)
 *  - review_reports        : signalements d'avis
 *  - moderation_actions    : journal des actions de modération ADMIN
 *
 * Enrichit (backward-compatible, ALTER TABLE ADD COLUMN uniquement) :
 *  - reviews : targetType/targetId (STORE|PRODUCT, cible explicite), isHidden,
 *              moderatedBy/moderatedAt, updatedAt
 * Sécurité : UNIQUE(orderId, targetType, targetId) = un avis par commande et par cible.
 */
const migration: Migration = {
  name: '001_lot_a_promotions_coupons_avis_moderation',
  up: (db: any) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS promotions (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        merchantId TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL CHECK (type IN ('PERCENT','FIXED','PROMO_PRICE')),
        value REAL NOT NULL,
        dateStart TEXT NOT NULL,
        dateEnd TEXT,
        minQty INTEGER DEFAULT 1,
        maxQty INTEGER,
        maxUses INTEGER,
        usesCount INTEGER DEFAULT 0,
        quantityAvailable INTEGER,
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED')),
        createdById TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS promotion_products (
        id TEXT PRIMARY KEY,
        promotionId TEXT NOT NULL,
        productId TEXT NOT NULL,
        UNIQUE(promotionId, productId),
        FOREIGN KEY (promotionId) REFERENCES promotions(id) ON DELETE CASCADE,
        FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_promotions_store ON promotions(storeId, status);

      CREATE TABLE IF NOT EXISTS coupons (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        merchantId TEXT NOT NULL,
        code TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('PERCENT','FIXED')),
        value REAL NOT NULL,
        dateStart TEXT NOT NULL,
        dateEnd TEXT,
        maxUses INTEGER,
        usesCount INTEGER DEFAULT 0,
        perClientLimit INTEGER DEFAULT 1,
        minOrderAmount REAL DEFAULT 0,
        productId TEXT,
        isActive INTEGER DEFAULT 1,
        createdById TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now')),
        UNIQUE(storeId, code),
        FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS coupon_redemptions (
        id TEXT PRIMARY KEY,
        couponId TEXT NOT NULL,
        orderId TEXT NOT NULL,
        storeId TEXT NOT NULL,
        clientId TEXT,
        discountAmount REAL NOT NULL,
        createdAt TEXT DEFAULT (datetime('now')),
        UNIQUE(couponId, orderId),
        FOREIGN KEY (couponId) REFERENCES coupons(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_coupons_store ON coupons(storeId, code);

      ALTER TABLE reviews ADD COLUMN targetType TEXT NOT NULL DEFAULT 'STORE';
      ALTER TABLE reviews ADD COLUMN targetId TEXT;
      ALTER TABLE reviews ADD COLUMN isHidden INTEGER DEFAULT 0;
      ALTER TABLE reviews ADD COLUMN moderatedBy TEXT;
      ALTER TABLE reviews ADD COLUMN moderatedAt TEXT;
      ALTER TABLE reviews ADD COLUMN updatedAt TEXT;
      -- rattrape les avis V1 : targetId = storeId pour les avis boutique
      UPDATE reviews SET targetId = storeId WHERE targetId IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_unique_per_order
        ON reviews(orderId, targetType, targetId);
      CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews(targetType, targetId, isHidden);

      -- Traçabilité V2 : promotions/coupons appliqués à une commande ou une vente
      ALTER TABLE orders ADD COLUMN promotionIds TEXT;
      ALTER TABLE orders ADD COLUMN couponId TEXT;
      ALTER TABLE sales ADD COLUMN promotionIds TEXT;
      ALTER TABLE sales ADD COLUMN couponId TEXT;


      CREATE TABLE IF NOT EXISTS review_reports (
        id TEXT PRIMARY KEY,
        reviewId TEXT NOT NULL,
        reportedByUserId TEXT NOT NULL,
        reason TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','REJECTED')),
        handledBy TEXT,
        handledAt TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (reviewId) REFERENCES reviews(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS moderation_actions (
        id TEXT PRIMARY KEY,
        reviewId TEXT,
        reportId TEXT,
        adminUserId TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT,
        createdAt TEXT DEFAULT (datetime('now'))
      );
    `);
  },
};

// Export du tableau exécuté par le runner au démarrage.
export const LOT_A_MIGRATIONS: Migration[] = [migration];

export function runAllMigrations(database?: any) {
  return runMigrations(database, LOT_A_MIGRATIONS);
}

if (require.main === module) {
  runAllMigrations();
}
