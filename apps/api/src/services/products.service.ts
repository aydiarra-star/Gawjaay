import { withinLimit, planLimits, type PlanCode } from '@gawjaay/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

/**
 * Vérifie que le plan de l'organisation autorise un produit actif de plus.
 * Centralisé ici pour être partagé par la route « catalogue » et le parcours
 * marchand (« Ajouter un produit »).
 */
export async function assertPlanAllowsProduct(orgId: string): Promise<void> {
  const sub = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
  const plan = (sub?.plan ?? 'FREE') as PlanCode;
  const limits = planLimits(plan);
  const count = await prisma.product.count({ where: { organizationId: orgId, isActive: true } });
  if (!withinLimit(limits.maxProducts, count)) {
    throw AppError.forbidden(`Limite du plan ${plan} atteinte (${limits.maxProducts} produits). Passez à un plan supérieur.`);
  }
}

/** Référence SKU unique et lisible, générée quand le marchand n'en fournit pas. */
export function generateSku(prefix = 'P'): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}
