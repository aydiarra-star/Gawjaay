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

const schema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional(),
  address: z.string().max(200).optional(),
});

router.get('/', requirePermission('customers:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const customers = await prisma.customer.findMany({
    where: {
      organizationId: req.auth.organizationId,
      ...(search ? { OR: [{ name: { contains: search } }, { phone: { contains: search } }] } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({ customers });
}));

/** Fiche client avec historique, achats et solde (cahier §19). */
router.get('/:id', requirePermission('customers:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, organizationId: req.auth.organizationId },
    include: { sales: { include: { payments: true }, orderBy: { createdAt: 'desc' }, take: 50 }, orders: { orderBy: { createdAt: 'desc' }, take: 50 } },
  });
  if (!customer) throw AppError.notFound('Client introuvable');

  // Une vente remboursée ne compte ni dans les achats ni dans le solde dû.
  const activeSales = customer.sales.filter((s) => s.status !== 'REFUNDED');
  const totalPurchases = activeSales.reduce((s, sale) => s + sale.total, 0);
  const balance = activeSales.reduce((sum, sale) => {
    const paid = sale.payments.filter((p) => p.status === 'SUCCESSFUL').reduce((s, p) => s + p.amount, 0);
    return sum + Math.max(0, sale.total - paid);
  }, 0);

  res.json({ customer: { ...customer, totalPurchases, balance } });
}));

router.post('/', requirePermission('customers:create'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = schema.parse(req.body);
  const customer = await prisma.customer.create({ data: { organizationId: req.auth.organizationId, ...input } });
  res.status(201).json({ customer });
}));

router.patch('/:id', requirePermission('customers:update'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const input = schema.partial().parse(req.body);
  const existing = await prisma.customer.findFirst({ where: { id: req.params.id, organizationId: req.auth.organizationId } });
  if (!existing) throw AppError.notFound('Client introuvable');
  const customer = await prisma.customer.update({ where: { id: existing.id }, data: input });
  res.json({ customer });
}));

export default router;
