import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrganization, requirePermission } from '../middleware/tenant.js';
import { buildExport, isExportKind } from '../services/exports.service.js';

const router = Router();
router.use(authenticate);
router.use(requireOrganization);

/**
 * Export CSV des données RÉELLES du tenant courant (permission `reports:export`).
 * Le filtrage `organizationId` est appliqué dans le service : aucune fuite
 * inter-tenant. `kind` ∈ sales | stock | customers | purchases.
 */
router.get('/:kind.csv', requirePermission('reports:export'), asyncHandler(async (req, res) => {
  if (!req.auth) throw AppError.unauthorized();
  if (!isExportKind(req.params.kind)) throw AppError.badRequest('Type d’export inconnu');
  const csv = await buildExport(req.auth.organizationId, req.params.kind);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="gawjaay-${req.params.kind}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

export default router;
