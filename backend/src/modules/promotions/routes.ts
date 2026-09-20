import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize, requirePermission } from '../../middlewares/rbac';
import * as controller from './controller';

const router = Router();

// Public : promotions actives d'une boutique (vitrine client)
router.get('/store/:storeId/active', controller.publicActiveHandler);

router.use(authMiddleware);
router.get('/store/:storeId', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.listHandler);
router.get('/:id', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.getHandler);
router.post('/', authorize(['MERCHANT', 'ADMIN']), requirePermission('promotions', 'manage'), controller.createHandler);
router.put('/:id', authorize(['MERCHANT', 'ADMIN']), requirePermission('promotions', 'manage'), controller.updateHandler);
router.delete('/:id', authorize(['MERCHANT', 'ADMIN']), requirePermission('promotions', 'manage'), controller.deleteHandler);

export default router;
