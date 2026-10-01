import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission } from '../middleware/tenant.js';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

/** Livreurs de l'organisation (cahier §27). */
router.get('/couriers', requirePermission('deliveries:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const couriers = await prisma.courier.findMany({ where: { organizationId: req.auth.organizationId }, orderBy: { name: 'asc' } });
  res.json({ couriers });
}));

router.post('/couriers', requirePermission('deliveries:update'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = z.object({ name: z.string().min(2).max(120), phone: z.string().max(30).optional(), type: z.enum(['INTERNAL', 'PARTNER']).default('INTERNAL') }).parse(req.body);
  const courier = await prisma.courier.create({ data: { organizationId: req.auth.organizationId, ...input } });
  res.status(201).json({ courier });
}));

/** Livraisons de l'organisation. */
router.get('/', requirePermission('deliveries:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const deliveries = await prisma.delivery.findMany({
    where: { order: { organizationId: req.auth.organizationId } },
    include: { order: { select: { id: true, customerName: true, customerPhone: true, total: true } }, courier: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ deliveries });
}));

/** Assigne un livreur et/ou met à jour le statut d'une livraison. */
router.patch('/:id', requirePermission('deliveries:update'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = z.object({
    courierId: z.string().nullable().optional(),
    status: z.enum(['PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'FAILED']).optional(),
    fee: z.number().int().nonnegative().optional(),
    address: z.string().max(200).optional(),
    phone: z.string().max(30).optional(),
    region: z.string().max(60).optional(),
    proofUrl: z.string().url().optional(),
  }).parse(req.body);

  const delivery = await prisma.delivery.findFirst({
    where: { id: req.params.id, order: { organizationId: req.auth.organizationId } },
  });
  if (!delivery) throw AppError.notFound('Livraison introuvable');

  if (input.courierId) {
    const courier = await prisma.courier.findFirst({ where: { id: input.courierId, organizationId: req.auth.organizationId } });
    if (!courier) throw AppError.notFound('Livreur introuvable');
  }

  const updated = await prisma.delivery.update({
    where: { id: delivery.id },
    data: {
      ...input,
      assignedAt: input.courierId && !delivery.assignedAt ? new Date() : delivery.assignedAt,
      deliveredAt: input.status === 'DELIVERED' ? new Date() : delivery.deliveredAt,
    },
  });
  res.json({ delivery: updated });
}));

export default router;
