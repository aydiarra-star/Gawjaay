import db, { cuid } from '../../lib/db';
import bcrypt from 'bcryptjs';
function nowIso(){ return new Date().toISOString(); }

export async function createEmployee(storeId: string, data: any, creatorUserId: string) {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as any;
  if (!store) throw Object.assign(new Error('Boutique introuvable'), { status: 404 });
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(data.phone) as any;
  if (existing) throw Object.assign(new Error('Téléphone déjà utilisé'), { status: 400 });
  const hash = await bcrypt.hash(data.password, 12);
  const userId = cuid();
  db.prepare('INSERT INTO users (id, phone, passwordHash, role, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(userId, data.phone, hash, 'EMPLOYEE', nowIso(), nowIso());
  const empId = cuid();
  db.prepare('INSERT INTO employees (id, storeId, userId, roleLabel, permissions, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)')
    .run(empId, storeId, userId, data.roleLabel, JSON.stringify(data.permissions), nowIso(), nowIso());
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, details, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(cuid(), creatorUserId, 'EMPLOYEE_CREATE', 'Employee', empId, JSON.stringify({ storeId, phone: data.phone }), nowIso());
  return { user: { id: userId, phone: data.phone }, employee: db.prepare('SELECT * FROM employees WHERE id = ?').get(empId) };
}

export async function listEmployees(storeId: string) {
  const emps = db.prepare('SELECT * FROM employees WHERE storeId = ?').all(storeId) as any[];
  return emps.map(e=>{
    const user = db.prepare('SELECT id, phone, lastLoginAt FROM users WHERE id = ?').get(e.userId);
    return { ...e, user };
  });
}

export async function updatePermissions(employeeId: string, permissions: string[], updaterId: string) {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId) as any;
  if (!emp) throw Object.assign(new Error('Employé introuvable'), { status: 404 });
  db.prepare('UPDATE employees SET permissions = ?, updatedAt = ? WHERE id = ?').run(JSON.stringify(permissions), nowIso(), employeeId);
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, createdAt) VALUES (?,?,?,?,?,?)').run(cuid(), updaterId, 'EMPLOYEE_PERM_UPDATE', 'Employee', employeeId, nowIso());
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId);
}

export async function deactivate(employeeId: string, updaterId: string) {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId) as any;
  if (!emp) throw Object.assign(new Error('Employé introuvable'), { status: 404 });
  db.prepare('UPDATE employees SET isActive = 0, updatedAt = ? WHERE id = ?').run(nowIso(), employeeId);
  db.prepare('UPDATE users SET isActive = 0, updatedAt = ? WHERE id = ?').run(nowIso(), emp.userId);
  db.prepare('INSERT INTO audit_logs (id, userId, action, resource, resourceId, createdAt) VALUES (?,?,?,?,?,?)').run(cuid(), updaterId, 'EMPLOYEE_DEACTIVATE', 'Employee', employeeId, nowIso());
}
