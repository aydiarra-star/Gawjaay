import db, { cuid } from '../lib/db';
import { AuthRequest } from './auth';

function nowIso(){ return new Date().toISOString(); }

export async function auditLog(req: AuthRequest, action: string, resource?: string, resourceId?: string, details?: any) {
  try {
    db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, details, ip, createdAt) VALUES (?,?,?,?,?,?,?,?)')
      .run(cuid(), req.user?.userId || null, action, resource || null, resourceId || null, details ? JSON.stringify(details) : null, req.ip || null, nowIso());
  } catch (e) {
    console.error('Audit log failed', e);
  }
}
