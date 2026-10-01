/**
 * Plans d'abonnement SaaS (cahier des charges §32).
 * Les limites sont contrôlées CÔTÉ SERVEUR. Aucun paiement d'abonnement réel n'est intégré :
 * `paid` indique si le plan nécessite un paiement (non connecté dans ce dépôt).
 */
export const PLANS = ['FREE', 'STANDARD', 'PRO', 'BUSINESS'] as const;
export type PlanCode = (typeof PLANS)[number];

export interface PlanLimits {
  /** Nombre maximum de boutiques. `null` = illimité. */
  maxStores: number | null;
  /** Nombre maximum de produits par organisation. */
  maxProducts: number | null;
  /** Nombre maximum d'utilisateurs (memberships). */
  maxUsers: number | null;
  /** Fonctionnalités activées. */
  features: string[];
  /** Le plan nécessite un paiement (non connecté ici). */
  paid: boolean;
  priceXOF: number | null;
}

export const PLAN_DEFINITIONS: Record<PlanCode, PlanLimits> = {
  FREE: { maxStores: 1, maxProducts: 50, maxUsers: 2, features: ['pos', 'inventory', 'dashboard'], paid: false, priceXOF: 0 },
  STANDARD: { maxStores: 1, maxProducts: 500, maxUsers: 5, features: ['pos', 'inventory', 'dashboard', 'online_shop', 'reports'], paid: true, priceXOF: null },
  PRO: { maxStores: 3, maxProducts: 5000, maxUsers: 15, features: ['pos', 'inventory', 'dashboard', 'online_shop', 'reports', 'marketplace', 'multi_store'], paid: true, priceXOF: null },
  BUSINESS: { maxStores: null, maxProducts: null, maxUsers: null, features: ['pos', 'inventory', 'dashboard', 'online_shop', 'reports', 'marketplace', 'multi_store', 'b2b', 'api'], paid: true, priceXOF: null },
};

export function planLimits(plan: PlanCode): PlanLimits {
  return PLAN_DEFINITIONS[plan] ?? PLAN_DEFINITIONS.FREE;
}

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === 'string' && (PLANS as readonly string[]).includes(value);
}

/** Vérifie une limite `null` = illimité. Renvoie true si la valeur respecte la limite. */
export function withinLimit(limit: number | null, current: number): boolean {
  return limit === null || current < limit;
}
