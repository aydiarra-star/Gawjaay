import { Router } from 'express';
import { z } from 'zod';
import { PLANS, PLAN_DEFINITIONS } from '@gawjaay/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission } from '../middleware/tenant.js';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

/** Plans disponibles (cahier §32). Aucun paiement d'abonnement n'est connecté. */
router.get('/plans', asyncHandler(async (_req, res) => {
  res.json({
    plans: PLANS.map((code) => ({ code, ...PLAN_DEFINITIONS[code] })),
    paymentConnected: false,
  });
}));

/** Abonnement courant de l'organisation. */
router.get('/current', requirePermission('subscriptions:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const sub = await prisma.subscription.findUnique({ where: { organizationId: req.auth.organizationId } });
  const usage = {
    stores: await prisma.store.count({ where: { organizationId: req.auth.organizationId } }),
    products: await prisma.product.count({ where: { organizationId: req.auth.organizationId, isActive: true } }),
    users: await prisma.membership.count({ where: { organizationId: req.auth.organizationId, isActive: true } }),
  };
  const plan = (sub?.plan ?? 'FREE') as keyof typeof PLAN_DEFINITIONS;
  res.json({ subscription: sub, plan: { code: plan, ...PLAN_DEFINITIONS[plan] }, usage });
}));

/**
 * Change de plan. Les plans payants ne peuvent PAS être activés : aucun paiement réel n'est connecté.
 * Seul le retour au plan FREE (ou la mise à jour d'un plan gratuit) est autorisé.
 */
router.post('/change', requirePermission('subscriptions:manage'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = z.object({ plan: z.enum(['FREE', 'STANDARD', 'PRO', 'BUSINESS']) }).parse(req.body);
  if (PLAN_DEFINITIONS[input.plan].paid) {
    throw AppError.unavailable('Le paiement d\'abonnement n\'est pas connecté : seuls les plans gratuits sont activables.');
  }
  const sub = await prisma.subscription.upsert({
    where: { organizationId: req.auth.organizationId },
    update: { plan: input.plan, status: 'ACTIVE' },
    create: { organizationId: req.auth.organizationId, plan: input.plan, status: 'ACTIVE' },
  });
  res.json({ subscription: sub });
}));

export default router;
