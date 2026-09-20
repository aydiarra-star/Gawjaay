import db from '../../lib/db';

export async function listNotifications(userId: string, onlyUnread = false, type?: string) {
  let sql = 'SELECT * FROM notifications WHERE userId = ?';
  const params: any[] = [userId];
  if (onlyUnread) sql += ' AND isRead = 0';
  if (type) sql += ' AND type = ?';
  params.push();
  if (type) params.push(type);
  sql += ' ORDER BY createdAt DESC LIMIT 100';
  return db.prepare(sql).all(...params);
}

export function unreadCount(userId: string) {
  const r = db.prepare('SELECT COUNT(*) as cnt FROM notifications WHERE userId = ? AND isRead = 0').get(userId) as any;
  return { unread: r.cnt };
}
export async function markRead(notificationId: string, userId: string) {
  const n = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId) as any;
  if (!n || n.userId !== userId) throw Object.assign(new Error('Notification introuvable'), { status: 404 });
  db.prepare('UPDATE notifications SET isRead = 1 WHERE id = ?').run(notificationId);
  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId);
}
export async function markAllRead(userId: string) {
  db.prepare('UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0').run(userId);
}
