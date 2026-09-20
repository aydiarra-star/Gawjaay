import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize, requirePermission } from '../../middlewares/rbac';
import * as controller from './controller';

const router = Router();

router.use(authMiddleware);
router.get('/store/:storeId', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.listHandler);
router.get('/:id', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.getHandler);
router.post('/', authorize(['MERCHANT', 'ADMIN']), requirePermission('coupons', 'manage'), controller.createHandler);
router.put('/:id', authorize(['MERCHANT', 'ADMIN']), requirePermission('coupons', 'manage'), controller.updateHandler);
router.post('/validate', authorize(['CLIENT', 'MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.validateHandler);
router.get('/:id/redemptions', authorize(['MERCHANT', 'ADMIN']), controller.redemptionsHandler);

export default router;
