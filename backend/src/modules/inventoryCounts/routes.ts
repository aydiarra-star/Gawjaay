import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize, requirePermission } from '../../middlewares/rbac';
import * as controller from './controller';

const router = Router();
router.use(authMiddleware);

// sessions d'inventaire par boutique
router.get('/store/:storeId', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.listHandler);
router.post('/store/:storeId/start', authorize(['MERCHANT', 'ADMIN']), requirePermission('stock', 'update'), controller.startHandler);
router.get('/:id', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.getHandler);
router.patch('/:id/items', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), requirePermission('stock', 'update'), controller.itemHandler);
router.post('/:id/confirm', authorize(['MERCHANT', 'ADMIN']), requirePermission('stock', 'update'), controller.confirmHandler);
router.post('/:id/cancel', authorize(['MERCHANT', 'ADMIN']), requirePermission('stock', 'update'), controller.cancelHandler);

export default router;
