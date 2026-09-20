// placeholder for users module - currently auth handles users
import db from '../../lib/db';
export async function getUser(id: string) {
  return db.prepare('SELECT id, phone, email, role, isActive, createdAt FROM users WHERE id = ?').get(id);
}
