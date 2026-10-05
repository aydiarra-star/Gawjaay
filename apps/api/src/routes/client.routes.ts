import { Router } from 'express';
import { z } from 'zod';
import { isCancellable, orderLabel, type OrderStatus } from '@gawjaay/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { createOrder, transitionOrder } from '../services/orders.service.js';

const router = Router();
router.use(authenticate);

/** Profil personnel : données fournies par l'utilisateur, modifiables à tout moment. */
router.get('/profile', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, fullName: true, phone: true, createdAt: true },
  });
  if (!user) throw AppError.notFound('Compte introuvable');
  res.json({ user });
}));

router.patch('/profile', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = z.object({
    fullName: z.string().min(2).max(120),
    phone: z.string().max(30).optional().nullable(),
  }).parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: { fullName: input.fullName.trim(), phone: input.phone?.trim() || null },
    select: { id: true, email: true, fullName: true, phone: true, createdAt: true },
  });
  res.json({ user });
}));

/** Ajoute l'identifiant lisible (factuel, dérivé de l'id et de la date) à une commande. */
function decorate<T extends { id: string; createdAt: Date }>(order: T) {
  return { ...order, label: orderLabel(order.id, order.createdAt) };
}

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
    // Clé d'idempotence générée par le navigateur : un rejeu ne double pas la commande.
    clientRequestId: z.string().min(6).max(80).optional(),
    items: z.array(z.object({ variantId: z.string(), quantity: z.number().int().positive() })).min(1),
  }).parse(req.body);

  try {
    const result = await prisma.$transaction((tx) =>
      createOrder(tx, { ...input, customerUserId: req.user!.id }),
    );
    res.status(201).json(result);
  } catch (err) {
    // Course d'idempotence : deux requêtes identiques simultanées. La seconde
    // heurte la contrainte unique (storeId, clientRequestId) ; on renvoie la
    // commande déjà créée au lieu d'échouer.
    if (input.clientRequestId && isUniqueViolation(err)) {
      const existing = await prisma.order.findFirst({
        where: { storeId: input.storeId, clientRequestId: input.clientRequestId.trim() },
      });
      if (existing) {
        res.status(200).json({
          orderId: existing.id,
          subtotal: existing.subtotal,
          deliveryFee: existing.deliveryFee,
          total: existing.total,
          replayed: true,
        });
        return;
      }
    }
    throw err;
  }
}));

/** Mes commandes (client). */
router.get('/orders', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const orders = await prisma.order.findMany({
    where: { customerUserId: req.user.id },
    include: {
      items: true,
      events: { orderBy: { createdAt: 'asc' } },
      delivery: true,
      store: { select: { name: true, slug: true, city: true, region: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ orders: orders.map(decorate) });
}));

router.get('/orders/:id', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, customerUserId: req.user.id },
    include: {
      items: true,
      events: { orderBy: { createdAt: 'asc' } },
      delivery: true,
      payments: true,
      store: { select: { name: true, slug: true, city: true, region: true, phone: true } },
    },
  });
  if (!order) throw AppError.notFound('Commande introuvable');
  res.json({ order: decorate(order), cancellable: isCancellable(order.status as OrderStatus) });
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

/** Détecte une violation de contrainte unique Prisma (P2002), sans dépendre du client. */
function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2002');
}

export default router;
