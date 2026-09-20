/**
 * Vérification manuelle du runtime PostgreSQL (non exécutée en CI).
 * Usage : DATABASE_URL=postgresql://user@host:5432/db npx tsx scripts/pg-runtime-verify.ts
 */
import db, { bootstrap } from '../src/lib/bootstrap';
import { isPostgres } from '../src/lib/db';

(async () => {
  console.log('isPostgres =', isPostgres);
  bootstrap();
  console.log('bootstrap OK');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
  console.log('table count =', tables.length);
  console.log('users count =', db.prepare('SELECT count(*) as c FROM users').get());
  console.log('stores count =', db.prepare('SELECT count(*) as c FROM stores').get());
  const r = db.prepare('SELECT 1 as one').get() as any;
  console.log('probe =', r);
})();
