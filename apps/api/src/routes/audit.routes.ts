import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission } from '../middleware/tenant.js';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

/** Journal d'audit de l'organisation (cahier §34). */
router.get('/', requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const logs = await prisma.auditLog.findMany({
    where: { organizationId: req.auth.organizationId },
    include: { user: { select: { email: true, fullName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({ logs });
}));

export default router;
