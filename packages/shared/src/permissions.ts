import type { Role } from './roles.js';

/**
 * Catalogue de permissions GawJaay (cahier des charges §10).
 * Format `resource:action`. Les rôles reçoivent un ensemble par défaut ;
 * des permissions fines pourront être stockées par membership (colonne JSON).
 */
export const PERMISSIONS = {
  products: ['read', 'create', 'update', 'delete'],
  categories: ['read', 'create', 'update', 'delete'],
  stock: ['read', 'adjust', 'transfer', 'receive'],
  sales: ['read', 'create', 'refund'],
  pos: ['use'],
  customers: ['read', 'create', 'update', 'delete'],
  suppliers: ['read', 'create', 'update', 'delete'],
  purchases: ['read', 'create', 'receive'],
  debts: ['read', 'pay'],
  receivables: ['read', 'collect'],
  orders: ['read', 'update', 'cancel'],
  deliveries: ['read', 'update'],
  payments: ['read', 'confirm'],
  reports: ['read', 'export'],
  users: ['manage'],
  settings: ['manage'],
  subscriptions: ['read', 'manage'],
} as const;

export type Resource = keyof typeof PERMISSIONS;
export type Action<R extends Resource> = (typeof PERMISSIONS)[R][number];

/** Toutes les permissions possibles sous forme `resource:action`. */
export const ALL_PERMISSIONS: string[] = Object.entries(PERMISSIONS).flatMap(([resource, actions]) =>
  (actions as readonly string[]).map((action) => `${resource}:${action}`),
);

export function isPermission(value: string): boolean {
  return ALL_PERMISSIONS.includes(value);
}

function perms(...pairs: Array<[Resource, readonly string[]]>): string[] {
  return pairs.flatMap(([resource, actions]) => actions.map((a) => `${resource}:${a}`));
}

/** Permissions par défaut par rôle (cahier §9/§10). */
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  // SUPER_ADMIN : plateforme entière (organisations, abonnements). N'agit pas sur les données métier d'une org
  // via les routes tenant (voir middlewares) ; dispose de `users:manage` et `subscriptions:manage`.
  SUPER_ADMIN: ['users:manage', 'subscriptions:read', 'subscriptions:manage', 'reports:read'],
  OWNER: ALL_PERMISSIONS.slice(),
  ADMIN: ALL_PERMISSIONS.filter((p) => p !== 'subscriptions:manage'),
  MANAGER: perms(
    ['products', PERMISSIONS.products],
    ['categories', PERMISSIONS.categories],
    ['stock', PERMISSIONS.stock],
    ['sales', ['read', 'create']],
    ['pos', PERMISSIONS.pos],
    ['customers', ['read', 'create', 'update']],
    ['suppliers', PERMISSIONS.suppliers],
    ['purchases', PERMISSIONS.purchases],
    ['debts', PERMISSIONS.debts],
    ['receivables', PERMISSIONS.receivables],
    ['orders', ['read', 'update', 'cancel']],
    ['deliveries', PERMISSIONS.deliveries],
    ['payments', ['read', 'confirm']],
    ['reports', ['read', 'export']],
  ),
  VENDEUR: perms(
    ['products', ['read']],
    ['stock', ['read']],
    ['sales', ['read', 'create']],
    ['pos', PERMISSIONS.pos],
    ['customers', ['read', 'create']],
    ['orders', ['read']],
    ['payments', ['read', 'confirm']],
    ['receivables', ['read']],
  ),
  STOCK: perms(
    ['products', ['read']],
    ['categories', ['read']],
    ['stock', PERMISSIONS.stock],
    ['suppliers', ['read']],
    ['purchases', ['read', 'receive']],
    ['reports', ['read']],
  ),
  CLIENT: [],
};

export function rolePermissions(role: Role): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Vérifie une permission en tenant compte d'éventuelles permissions fines par membership.
 * `granted` (si fourni) REMPLACE les permissions par défaut du rôle.
 */
export function hasPermission(role: Role, permission: string, granted?: string[] | null): boolean {
  const effective = granted && granted.length > 0 ? granted : rolePermissions(role);
  return effective.includes(permission);
}
