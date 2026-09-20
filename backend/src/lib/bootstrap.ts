import db, { initDb, cuid } from './db';
import { runAllMigrations } from '../migrations/versions/004_lot_d';

/**
 * Bootstrap complet du schéma : base V1 (initDb) + migrations versionnées V2.
 * Point d'entrée unique (app, seed, tests) — idempotent.
 */
export function bootstrap() {
  initDb();
  runAllMigrations(db);
}

export { db, initDb, cuid };
export default db;
