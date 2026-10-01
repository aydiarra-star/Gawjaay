import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission } from '../middleware/tenant.js';
import { dashboard, resolveRange, salesStats } from '../services/reports.service.js';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

/** Tableau de bord : données réelles calculées depuis la base (cahier §28). */
router.get('/dashboard', requirePermission('reports:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const range = resolveRange({
    range: typeof req.query.range === 'string' ? req.query.range : undefined,
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
  });
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
  if (storeId && !req.auth.storeIds.includes(storeId)) throw AppError.notFound('Boutique introuvable');
  const data = await dashboard(req.auth.organizationId, range, storeId);
  res.json(data);
}));

/** Statistiques de ventes réelles (cahier §29). */
router.get('/sales', requirePermission('reports:read'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  const range = resolveRange({
    range: typeof req.query.range === 'string' ? req.query.range : undefined,
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
  });
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
  if (storeId && !req.auth.storeIds.includes(storeId)) throw AppError.notFound('Boutique introuvable');
  const data = await salesStats(req.auth.organizationId, range, storeId);
  res.json(data);
}));

export default router;
