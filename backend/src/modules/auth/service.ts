import bcrypt from 'bcryptjs';
import db, { cuid } from '../../lib/db';
import { signAccess, signRefresh } from '../../utils/jwt';

function nowIso() { return new Date().toISOString(); }

export async function register(data: { phone: string; password: string; email?: string; role?: string; name?: string }) {
  const existing = db.prepare('SELECT id FROM users WHERE phone = ? OR email = ?').get(data.phone, data.email || null) as any;
  if (existing) throw Object.assign(new Error('Téléphone ou email déjà utilisé'), { status: 400 });

  const hash = await bcrypt.hash(data.password, 12);
  const role = data.role === 'MERCHANT' ? 'MERCHANT' : 'CLIENT';
  const userId = cuid();
  db.prepare('INSERT INTO users (id, phone, email, passwordHash, role, isPhoneVerified, createdAt, updatedAt) VALUES (?,?,?,?,?,1,?,?)')
    .run(userId, data.phone, data.email || null, hash, role, nowIso(), nowIso());

  let merchantId: string | undefined;
  if (role === 'MERCHANT') {
    merchantId = cuid();
    db.prepare('INSERT INTO merchants (id, userId, businessName, createdAt, updatedAt) VALUES (?,?,?,?,?)')
      .run(merchantId, userId, data.name || null, nowIso(), nowIso());
  }

  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, createdAt) VALUES (?,?,?,?,?,?)')
    .run(cuid(), userId, 'REGISTER', 'User', userId, nowIso());

  const payload: any = { userId, role, merchantId };
  const accessToken = signAccess(payload);
  const sessionId = cuid();
  const tempRefresh = 'temp';
  db.prepare('INSERT INTO sessions (id, userId, refreshToken, expiresAt, createdAt) VALUES (?,?,?,?,?)')
    .run(sessionId, userId, tempRefresh, new Date(Date.now()+7*24*3600*1000).toISOString(), nowIso());
  const refreshToken = signRefresh({ userId, sessionId });
  db.prepare('UPDATE sessions SET refreshToken = ? WHERE id = ?').run(refreshToken, sessionId);

  const user = { id: userId, phone: data.phone, email: data.email, role };
  return { user, accessToken, refreshToken };
}

export async function login(phone: string, password: string, ip?: string, ua?: string) {
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as any;
  if (!user) throw Object.assign(new Error('Identifiants invalides'), { status: 401 });
  if (!user.isActive) throw Object.assign(new Error('Compte désactivé'), { status: 403 });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    db.prepare('INSERT INTO audit_logs (id, userId, action, ip, createdAt) VALUES (?,?,?,?,?)')
      .run(cuid(), user.id, 'LOGIN_FAILED', ip || null, nowIso());
    throw Object.assign(new Error('Identifiants invalides'), { status: 401 });
  }

  const merchant = db.prepare('SELECT * FROM merchants WHERE userId = ?').get(user.id) as any;
  let storeIds: string[] = [];
  if (merchant) {
    const stores = db.prepare('SELECT id FROM stores WHERE merchantId = ?').all(merchant.id) as any[];
    storeIds = stores.map(s=>s.id);
  }
  if (user.role === 'EMPLOYEE') {
    const emp = db.prepare('SELECT * FROM employees WHERE userId = ?').get(user.id) as any;
    if (emp) storeIds = [emp.storeId];
  }

  const payload: any = { userId: user.id, role: user.role, merchantId: merchant?.id, storeIds };
  const accessToken = signAccess(payload);
  const sessionId = cuid();
  db.prepare('INSERT INTO sessions (id, userId, refreshToken, ip, userAgent, expiresAt, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(sessionId, user.id, 'temp', ip || null, ua || null, new Date(Date.now()+7*24*3600*1000).toISOString(), nowIso());
  const refreshToken = signRefresh({ userId: user.id, sessionId });
  db.prepare('UPDATE sessions SET refreshToken = ? WHERE id = ?').run(refreshToken, sessionId);

  db.prepare('UPDATE users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?').run(nowIso(), nowIso(), user.id);
  db.prepare('INSERT INTO audit_logs (id, userId, action, ip, createdAt) VALUES (?,?,?,?,?)')
    .run(cuid(), user.id, 'LOGIN_SUCCESS', ip || null, nowIso());

  return { user: { id: user.id, phone: user.phone, email: user.email, role: user.role, merchantId: merchant?.id }, accessToken, refreshToken };
}

export async function refresh(refreshToken: string) {
  const { verifyRefresh } = await import('../../utils/jwt');
  let decoded;
  try { decoded = verifyRefresh(refreshToken); } catch { throw Object.assign(new Error('Refresh invalide'), { status: 401 }); }
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(decoded.sessionId) as any;
  if (!session || session.revoked || session.refreshToken !== refreshToken || new Date(session.expiresAt) < new Date()) {
    throw Object.assign(new Error('Session expirée'), { status: 401 });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.userId) as any;
  if (!user) throw Object.assign(new Error('Utilisateur introuvable'), { status: 404 });
  const merchant = db.prepare('SELECT * FROM merchants WHERE userId = ?').get(user.id) as any;
  const payload: any = { userId: user.id, role: user.role, merchantId: merchant?.id };
  const accessToken = signAccess(payload);
  return { accessToken };
}

export async function logout(refreshToken: string) {
  const session = db.prepare('SELECT * FROM sessions WHERE refreshToken = ?').get(refreshToken) as any;
  if (session) db.prepare('UPDATE sessions SET revoked = 1 WHERE id = ?').run(session.id);
}

export async function changePassword(userId: string, oldPass: string, newPass: string) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  if (!user) throw Object.assign(new Error('Utilisateur introuvable'), { status: 404 });
  const ok = await bcrypt.compare(oldPass, user.passwordHash);
  if (!ok) throw Object.assign(new Error('Ancien mot de passe incorrect'), { status: 400 });
  const hash = await bcrypt.hash(newPass, 12);
  db.prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?').run(hash, nowIso(), userId);
  db.prepare('UPDATE sessions SET revoked = 1 WHERE userId = ?').run(userId);
  db.prepare('INSERT INTO audit_logs (id, userId, action, createdAt) VALUES (?,?,?,?)').run(cuid(), userId, 'PASSWORD_CHANGE', nowIso());
}
