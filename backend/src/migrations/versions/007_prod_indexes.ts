import type { Migration } from '../runner';
import { runMigrations } from '../runner';
import { LOT_A_MIGRATIONS } from './001_lot_a';
import { LOT_B_MIGRATIONS } from './002_lot_b';
import { LOT_C_MIGRATIONS } from './003_lot_c';
import { LOT_D_MIGRATIONS } from './004_lot_d';
import { LOT_E_MIGRATIONS } from './005_lot_e';
import { LOT_F_MIGRATIONS } from './006_lot_f';

/**
 * MIGRATION 007 — Index production (mission readiness §14 : ajouté uniquement si nécessaire).
 *
 * Décisions FONDÉES SUR MESURES (30k ventes / 30k mouvements / 5k notifications / 800 livraisons,
 * EXPLAIN QUERY PLAN + timings, cf docs/V2_READY_FOR_PILOT.md §Performance) :
 * - sales(storeId, createdAt)        : fenêtre courte analytics ×2.3 plus rapide (SCAN -> INDEX).
 * - notifications(userId, createdAt) : ×7 plus rapide (liste/unread par utilisateur).
 * - deliveries(storeId, status)      : ×6 plus rapide (back-office livraisons actives).
 * - inventory_movements(storeId, productId, createdAt) : ÉVALUÉ ET REJETÉ — la requête de
 *   dormance (GROUP BY productId) est ~2× PLUS LENTE avec l'index (accès aléatoires > scan
 *   séquentiel sur ce profil). Réévaluer à volume réel avant de l'ajouter.
 * Non destructif : CREATE INDEX IF NOT EXISTS uniquement.
 */
const migration: Migration = {
  name: '007_prod_indexes',
  up: (db: any) => {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sales_store_created ON sales(storeId, createdAt);
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(userId, createdAt);
      CREATE INDEX IF NOT EXISTS idx_deliveries_store_status ON deliveries(storeId, status);
    `);
  },
};

export const LOT_G_MIGRATIONS: Migration[] = [migration];

/** Applique toutes les migrations connues, dans l'ordre (idempotent). */
export function runAllMigrations(database?: any) {
  return runMigrations(database, [...LOT_A_MIGRATIONS, ...LOT_B_MIGRATIONS, ...LOT_C_MIGRATIONS, ...LOT_D_MIGRATIONS, ...LOT_E_MIGRATIONS, ...LOT_F_MIGRATIONS, ...LOT_G_MIGRATIONS]);
}
