import type { Migration } from '../runner';
import { runMigrations } from '../runner';
import { LOT_A_MIGRATIONS } from './001_lot_a';
import { LOT_B_MIGRATIONS } from './002_lot_b';
import { LOT_C_MIGRATIONS } from './003_lot_c';
import { LOT_D_MIGRATIONS } from './004_lot_d';

/**
 * MIGRATION 005 — LOT E : livraison, livreurs, preuves de livraison.
 *
 * Principe : EXTENSION non destructive du module V1 (deliveries existant).
 * - Nouveaux livreurs (drivers) rattachés à un marchand, avec compte optionnel (role DRIVER).
 * - Preuves de livraison traçables (delivery_proofs : PHOTO, SIGNATURE, OTP, GPS).
 * - Code OTP à la remise : généré à l'assignation, envoyé au client, vérifié serveur,
 *   à usage unique. Le livreur ne voit JAMAIS le code.
 * - Colonnes ajoutées à deliveries (ALTER) : driverId, otpCode, otpSentAt, failedReason, deliveredTo.
 *
 * Machine à états livraison (validée serveur pour le flux V2) :
 * A_PREPARER → PRET → EN_LIVRAISON → LIVRE ; ANNULE depuis A_PREPARER/PRET ;
 * LIVRE direct depuis A_PREPARER/PRET = remise en main propre sans livreur ;
 * EN_LIVRAISON → PRET = échec (motif requis).
 * Les chemins legacy V1 (updateDeliveryStatus / assignDelivery employé) sont conservés
 * tels quels pour compatibilité ascendante.
 */
const migration: Migration = {
  name: '005_lot_e_livraison_livreurs_preuves',
  up: (db: any) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS drivers (
        id TEXT PRIMARY KEY,
        merchantId TEXT NOT NULL,
        userId TEXT,
        name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        vehicle TEXT,
        isActive INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now')),
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
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (deliveryId) REFERENCES deliveries(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_proofs_delivery ON delivery_proofs(deliveryId);

      ALTER TABLE deliveries ADD COLUMN driverId TEXT;
      ALTER TABLE deliveries ADD COLUMN otpCode TEXT;
      ALTER TABLE deliveries ADD COLUMN otpSentAt TEXT;
      ALTER TABLE deliveries ADD COLUMN failedReason TEXT;
      ALTER TABLE deliveries ADD COLUMN deliveredTo TEXT;
    `);
  },
};

export const LOT_E_MIGRATIONS: Migration[] = [migration];

/** Applique toutes les migrations connues, dans l'ordre (idempotent). */
export function runAllMigrations(database?: any) {
  return runMigrations(database, [...LOT_A_MIGRATIONS, ...LOT_B_MIGRATIONS, ...LOT_C_MIGRATIONS, ...LOT_D_MIGRATIONS, ...LOT_E_MIGRATIONS]);
}
