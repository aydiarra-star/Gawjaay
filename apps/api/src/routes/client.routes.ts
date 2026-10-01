import { Router } from 'express';
import { z } from 'zod';
import { isCancellable, type OrderStatus } from '@gawjaay/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { createOrder, transitionOrder } from '../services/orders.service.js';

const router = Router();
router.use(authenticate);

/** Passer une commande en ligne (cahier §24, §25, §26). */
router.post('/orders', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = z.object({
    storeId: z.string(),
    customerName: z.string().min(2).max(120),
    customerPhone: z.string().min(4).max(30),
    deliveryAddress: z.string().max(200).optional(),
    deliveryRegion: z.string().max(60).optional(),
    note: z.string().max(300).optional(),
    deliveryFee: z.number().int().nonnegative().default(0),
    items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().positive() })).min(1),
  }).parse(req.body);

  const result = await prisma.$transaction((tx) =>
    createOrder(tx, { ...input, customerUserId: req.user!.id }),
  );
  res.status(201).json(result);
}));

/** Mes commandes (client). */
router.get('/orders', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const orders = await prisma.order.findMany({
    where: { customerUserId: req.user.id },
    include: { items: true, events: { orderBy: { createdAt: 'asc' } }, delivery: true, store: { select: { name: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ orders });
}));

router.get('/orders/:id', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, customerUserId: req.user.id },
    include: { items: true, events: { orderBy: { createdAt: 'asc' } }, delivery: true, store: { select: { name: true, slug: true, phone: true } } },
  });
  if (!order) throw AppError.notFound('Commande introuvable');
  res.json({ order });
}));

/** Annulation par le client (statuts autorisés uniquement). */
router.post('/orders/:id/cancel', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const order = await prisma.order.findFirst({ where: { id: req.params.id, customerUserId: req.user.id } });
  if (!order) throw AppError.notFound('Commande introuvable');
  if (!isCancellable(order.status as OrderStatus)) throw AppError.conflict('Cette commande ne peut plus être annulée');

  const result = await prisma.$transaction((tx) =>
    transitionOrder(tx, order.organizationId, order.id, 'CANCELLED', req.user!.id, 'Annulation client'),
  );
  res.json(result);
}));

export default router;
