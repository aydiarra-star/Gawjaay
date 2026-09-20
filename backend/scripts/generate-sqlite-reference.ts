/**
 * Génère la référence SQLite complète (base V1 + migrations 001→006) pour la
 * validation de parité PostgreSQL (deploy/postgres/validate.mjs).
 * Usage : npx tsx scripts/generate-sqlite-reference.ts  (depuis backend/)
 */
process.env.DATABASE_URL = 'file:./reference-gen.db';
import db from '../src/lib/db';
import { bootstrap } from '../src/lib/bootstrap';

bootstrap();
db.exec(`PRAGMA wal_checkpoint(TRUNCATE); VACUUM INTO '../deploy/postgres/reference-schema.sqlite';`);
process.exit(0);
