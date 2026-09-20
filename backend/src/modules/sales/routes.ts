import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { idempotencyMiddleware } from '../../middlewares/idempotency';
import { authorize, requirePermission } from '../../middlewares/rbac';
import { createHandler, listHandler, getHandler } from './controller';

const router = Router();
router.use(authMiddleware);
router.post('/store/:storeId', authorize(['MERCHANT','EMPLOYEE','ADMIN']), requirePermission('sales','create'), idempotencyMiddleware, createHandler);
router.get('/store/:storeId', authorize(['MERCHANT','EMPLOYEE','ADMIN']), listHandler);
router.get('/:id', authorize(['MERCHANT','EMPLOYEE','ADMIN']), getHandler);
export default router;
