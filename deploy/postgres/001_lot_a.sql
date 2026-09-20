-- GawJaay V2 — migration 001_lot_a (portage PostgreSQL 1:1 de 001_lot_a.ts)
-- Contenu : promotions/coupons/avis (colonnes)/moderation

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
        createdAt TEXT DEFAULT (now()::text),
        updatedAt TEXT DEFAULT (now()::text),
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
        createdAt TEXT DEFAULT (now()::text),
        updatedAt TEXT DEFAULT (now()::text),
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
        createdAt TEXT DEFAULT (now()::text),
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
        createdAt TEXT DEFAULT (now()::text),
        FOREIGN KEY (reviewId) REFERENCES reviews(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS moderation_actions (
        id TEXT PRIMARY KEY,
        reviewId TEXT,
        reportId TEXT,
        adminUserId TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT,
        createdAt TEXT DEFAULT (now()::text)
      );
