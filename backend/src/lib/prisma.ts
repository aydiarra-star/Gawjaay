// Legacy file kept for compatibility - now uses node:sqlite via db.ts
import db, { initDb, cuid } from './db';

initDb();

export { db, cuid, initDb };
export default db as any;
