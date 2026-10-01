/**
 * Rôles du système GawJaay (cahier des charges §9).
 *
 * SUPER_ADMIN : administration de la plateforme GawJaay (hors organisation).
 * OWNER       : propriétaire de l'entreprise (tous droits sur son organisation).
 * ADMIN       : administration de l'entreprise.
 * MANAGER     : gestion opérationnelle (produits, stock, ventes, commandes).
 * VENDEUR     : ventes et caisse.
 * STOCK       : gestion du stock (réceptions, transferts, ajustements, inventaire).
 * CLIENT      : marketplace et commandes.
 */
export const ROLES = [
  'SUPER_ADMIN',
  'OWNER',
  'ADMIN',
  'MANAGER',
  'VENDEUR',
  'STOCK',
  'CLIENT',
] as const;

export type Role = (typeof ROLES)[number];

/** Rôles rattachés à une organisation (membership). SUPER_ADMIN est hors organisation. */
export const ORGANIZATION_ROLES: Role[] = ['OWNER', 'ADMIN', 'MANAGER', 'VENDEUR', 'STOCK'];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super administrateur',
  OWNER: 'Propriétaire',
  ADMIN: 'Administrateur',
  MANAGER: 'Gestionnaire',
  VENDEUR: 'Vendeur',
  STOCK: 'Gestion du stock',
  CLIENT: 'Client',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
