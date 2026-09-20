import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../../middlewares/auth';
import { authorize, requirePermission } from '../../middlewares/rbac';
import { idempotencyMiddleware } from '../../middlewares/idempotency';
import { createHandler, updateStatusHandler, listHandler, getHandler } from './controller';

const router = Router();
router.use(authMiddleware);
router.post('/', authorize(['CLIENT','MERCHANT','ADMIN']), idempotencyMiddleware, createHandler);
router.get('/', listHandler);
router.get('/:id', getHandler);
// EMPLOYEE : permission fine `orders:update` requise (PROJECT_RULES §7) ; CLIENT/MERCHANT/ADMIN : règles dans le service
router.patch('/:id/status', authorize(['CLIENT','MERCHANT','EMPLOYEE','ADMIN']), (req: AuthRequest, res, next) => {
  if (req.user?.role === 'EMPLOYEE') return requirePermission('orders', 'update')(req, res, next);
  next();
}, updateStatusHandler);
export default router;
