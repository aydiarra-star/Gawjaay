import type { Migration } from '../runner';
import { runMigrations } from '../runner';
import { LOT_A_MIGRATIONS } from './001_lot_a';
import { LOT_B_MIGRATIONS } from './002_lot_b';
import { LOT_C_MIGRATIONS } from './003_lot_c';
import { LOT_D_MIGRATIONS } from './004_lot_d';
import { LOT_E_MIGRATIONS } from './005_lot_e';

/**
 * MIGRATION 006 — LOT F : Assistant IA + actions contrôlées.
 *
 * Principe « strict no-invention » : l'assistant n'est JAMAIS branché en direct sur un
 * LLM générateur. C'est un moteur d'intentions déterministe qui interroge les données
 * réelles de la boutique (analytics, inventaires, commandes). Si la donnée n'existe pas,
 * la réponse est « Je ne dispose pas de cette information ».
 *
 * Actions sensibles = deux temps : ai_action_requests (PENDING → CONFIRMED/REJECTED →
 * EXECUTED/FAILED/EXPIRED) avec confirmation explicite du commerçant + audit.
 */
const migration: Migration = {
  name: '006_lot_f_assistant_ia_actions_controlees',
  up: (db: any) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        storeId TEXT NOT NULL,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ai_conv_user ON ai_conversations(userId, storeId, updatedAt);

      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('USER','ASSISTANT')),
        content TEXT NOT NULL,
        intent TEXT,
        dataJson TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (conversationId) REFERENCES ai_conversations(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ai_msg_conv ON ai_messages(conversationId, createdAt);

      CREATE TABLE IF NOT EXISTS ai_action_requests (
        id TEXT PRIMARY KEY,
        storeId TEXT NOT NULL,
        userId TEXT NOT NULL,
        actionType TEXT NOT NULL,
        paramsJson TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','REJECTED','EXECUTED','FAILED','EXPIRED')),
        resultJson TEXT,
        expiresAt TEXT,
        confirmedAt TEXT,
        executedAt TEXT,
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (storeId) REFERENCES stores(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ai_action_store ON ai_action_requests(storeId, status, createdAt);
    `);
  },
};

export const LOT_F_MIGRATIONS: Migration[] = [migration];

/** Applique toutes les migrations connues, dans l'ordre (idempotent). */
export function runAllMigrations(database?: any) {
  return runMigrations(database, [...LOT_A_MIGRATIONS, ...LOT_B_MIGRATIONS, ...LOT_C_MIGRATIONS, ...LOT_D_MIGRATIONS, ...LOT_E_MIGRATIONS, ...LOT_F_MIGRATIONS]);
}
