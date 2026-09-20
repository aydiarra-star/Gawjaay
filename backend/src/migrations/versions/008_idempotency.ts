import type { Migration } from '../runner';
import { runMigrations } from '../runner';
import { LOT_A_MIGRATIONS } from './001_lot_a';
import { LOT_B_MIGRATIONS } from './002_lot_b';
import { LOT_C_MIGRATIONS } from './003_lot_c';
import { LOT_D_MIGRATIONS } from './004_lot_d';
import { LOT_E_MIGRATIONS } from './005_lot_e';
import { LOT_F_MIGRATIONS } from './006_lot_f';
import { LOT_G_MIGRATIONS } from './007_prod_indexes';

/**
 * MIGRATION 008 — Idempotence des opérations financières (mission readiness §21).
 *
 * Risque traité : réseau mobile faible / double-tap → création de commande ou de vente
 * en double (double décrément de stock). Le client peut envoyer un header
 * `Idempotency-Key` sur POST /orders et POST /sales/store/:id : la première réponse est
 * rejouée à l'identique. Sans header, comportement inchangé (rétrocompatible).
 */
const migration: Migration = {
  name: '008_idempotency_keys',
  up: (db: any) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        userId TEXT,
        status INTEGER NOT NULL,
        responseJson TEXT NOT NULL,
        createdAt TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (key, endpoint)
      );
    `);
  },
};

export const LOT_H_MIGRATIONS: Migration[] = [migration];

/** Applique toutes les migrations connues, dans l'ordre (idempotent). */
export function runAllMigrations(database?: any) {
  return runMigrations(database, [...LOT_A_MIGRATIONS, ...LOT_B_MIGRATIONS, ...LOT_C_MIGRATIONS, ...LOT_D_MIGRATIONS, ...LOT_E_MIGRATIONS, ...LOT_F_MIGRATIONS, ...LOT_G_MIGRATIONS, ...LOT_H_MIGRATIONS]);
}
