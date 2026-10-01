import { Router } from 'express';
import { z } from 'zod';
import { allowedTransitions, isOrderStatus } from '@gawjaay/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission } from '../middleware/tenant.js';
import { transitionOrder } from '../services/orders.service.js';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

/** Commandes reçues par l'organisation (cahier §26). */
router.get('/', requirePermission('orders:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const orders = await prisma.order.findMany({
    where: { organizationId: req.auth.organizationId, ...(status ? { status } : {}) },
    include: { items: true, events: { orderBy: { createdAt: 'desc' } }, delivery: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ orders });
}));

router.get('/:id', requirePermission('orders:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, organizationId: req.auth.organizationId },
    include: { items: true, events: { orderBy: { createdAt: 'asc' } }, delivery: true, payments: true },
  });
  if (!order) throw AppError.notFound('Commande introuvable');
  res.json({ order, allowedTransitions: allowedTransitions(order.status as never) });
}));

/** Change le statut d'une commande (machine à états + effets stock + historique). */
router.post('/:id/transition', requirePermission('orders:update'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = z.object({ to: z.string(), note: z.string().max(300).optional() }).parse(req.body);
  const to = input.to;
  if (!isOrderStatus(to)) throw AppError.badRequest('Statut invalide');
  const result = await prisma.$transaction((tx) =>
    transitionOrder(tx, req.auth!.organizationId, req.params.id, to, req.auth!.userId, input.note),
  );
  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'order.transition', entity: 'order', entityId: req.params.id, meta: result });
  res.json(result);
}));

/** Annulation par le marchand (statuts autorisés uniquement). */
router.post('/:id/cancel', requirePermission('orders:cancel'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const result = await prisma.$transaction((tx) =>
    transitionOrder(tx, req.auth!.organizationId, req.params.id, 'CANCELLED', req.auth!.userId, 'Annulation marchand'),
  );
  await audit({ organizationId: req.auth.organizationId, userId: req.auth.userId, action: 'order.cancel', entity: 'order', entityId: req.params.id });
  res.json(result);
}));

export default router;
