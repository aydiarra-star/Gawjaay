-- GawJaay V2 — migration 005_lot_e (portage PostgreSQL 1:1 de 005_lot_e.ts)
-- Contenu : livreurs/preuves de livraison

CREATE TABLE IF NOT EXISTS drivers (
        id TEXT PRIMARY KEY,
        merchantId TEXT NOT NULL,
        userId TEXT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        vehicle TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT DEFAULT (now()::text),
        updatedAt TEXT DEFAULT (now()::text),
        FOREIGN KEY (merchantId) REFERENCES merchants(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_drivers_merchant ON drivers(merchantId, isActive);

      CREATE TABLE IF NOT EXISTS delivery_proofs (
        id TEXT PRIMARY KEY,
        deliveryId TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('PHOTO','SIGNATURE','OTP','GPS')),
        data TEXT,
        latitude REAL,
        longitude REAL,
        createdAt TEXT DEFAULT (now()::text),
        FOREIGN KEY (deliveryId) REFERENCES deliveries(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_proofs_delivery ON delivery_proofs(deliveryId);

      ALTER TABLE deliveries ADD COLUMN driverId TEXT;
      ALTER TABLE deliveries ADD COLUMN otpCode TEXT;
      ALTER TABLE deliveries ADD COLUMN otpSentAt TEXT;
      ALTER TABLE deliveries ADD COLUMN failedReason TEXT;
      ALTER TABLE deliveries ADD COLUMN deliveredTo TEXT;
