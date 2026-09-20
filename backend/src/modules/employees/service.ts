import db, { cuid } from '../../lib/db';
import bcrypt from 'bcryptjs';
import { withTransaction } from '../../lib/transaction';
import { recordAudit } from '../../lib/audit';
import { parseOrThrow } from '../../lib/validate';
import { employeeCreateSchema, employeePermissionsSchema, EMPLOYEE_RESOURCES } from '../../utils/validators';
function nowIso(){ return new Date().toISOString(); }

/** Permissions proposées à l'UI (cahier §5) — format resource:action. */
export const PERMISSION_CATALOG = EMPLOYEE_RESOURCES.flatMap((r) => [`${r}:create`, `${r}:read`, `${r}:update`, `${r}:delete`, `${r}:*`]);

export async function createEmployee(storeId: string, rawData: any, creatorUserId: string) {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as any;
  if (!store) throw Object.assign(new Error('Boutique introuvable'), { status: 404 });
  const data = parseOrThrow(employeeCreateSchema, rawData);
  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(data.phone) as any;
  if (existing) throw Object.assign(new Error('Téléphone déjà utilisé'), { status: 400 });
  const hash = await bcrypt.hash(data.password, 12);
  const userId = cuid();
  const empId = cuid();
  withTransaction(() => {
    db.prepare('INSERT INTO users (id, phone, passwordHash, role, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(userId, data.phone, hash, 'EMPLOYEE', nowIso(), nowIso());
    db.prepare('INSERT INTO employees (id, storeId, userId, roleLabel, permissions, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)')
      .run(empId, storeId, userId, data.roleLabel, JSON.stringify(data.permissions), nowIso(), nowIso());
    recordAudit(creatorUserId, 'EMPLOYEE_CREATE', 'Employee', empId, { storeId, phone: data.phone, permissions: data.permissions });
  });
  return { user: { id: userId, phone: data.phone }, employee: db.prepare('SELECT * FROM employees WHERE id = ?').get(empId) };
}

export async function listEmployees(storeId: string) {
  // V3 (perf) : une seule requête jointe — jamais de passwordHash exposé
  return db.prepare(`SELECT e.*, u.phone AS userPhone, u.lastLoginAt AS userLastLoginAt, u.isActive AS userIsActive
    FROM employees e JOIN users u ON u.id = e.userId WHERE e.storeId = ? ORDER BY e.createdAt ASC`).all(storeId)
    .map((e: any) => {
      const { userPhone, userLastLoginAt, userIsActive, ...rest } = e;
      return { ...rest, user: { id: e.userId, phone: userPhone, lastLoginAt: userLastLoginAt, isActive: userIsActive } };
    });
}

export function getEmployee(employeeId: string) {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId) as any;
  if (!emp) throw Object.assign(new Error('Employé introuvable'), { status: 404 });
  return emp;
}

export async function updatePermissions(employeeId: string, permissions: string[], updaterId: string) {
  const emp = getEmployee(employeeId);
  const { permissions: perms } = parseOrThrow(employeePermissionsSchema, { permissions });
  db.prepare('UPDATE employees SET permissions = ?, updatedAt = ? WHERE id = ?').run(JSON.stringify(perms), nowIso(), employeeId);
  recordAudit(updaterId, 'EMPLOYEE_PERM_UPDATE', 'Employee', employeeId, { storeId: emp.storeId, permissions: perms });
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId);
}

export async function deactivate(employeeId: string, updaterId: string) {
  const emp = getEmployee(employeeId);
  withTransaction(() => {
    db.prepare('UPDATE employees SET isActive = 0, updatedAt = ? WHERE id = ?').run(nowIso(), employeeId);
    db.prepare('UPDATE users SET isActive = 0, updatedAt = ? WHERE id = ?').run(nowIso(), emp.userId);
    recordAudit(updaterId, 'EMPLOYEE_DEACTIVATE', 'Employee', employeeId, { storeId: emp.storeId });
  });
}

export async function reactivate(employeeId: string, updaterId: string) {
  const emp = getEmployee(employeeId);
  withTransaction(() => {
    db.prepare('UPDATE employees SET isActive = 1, updatedAt = ? WHERE id = ?').run(nowIso(), employeeId);
    db.prepare('UPDATE users SET isActive = 1, updatedAt = ? WHERE id = ?').run(nowIso(), emp.userId);
    recordAudit(updaterId, 'EMPLOYEE_REACTIVATE', 'Employee', employeeId, { storeId: emp.storeId });
  });
  return db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId);
}
