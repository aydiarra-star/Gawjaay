import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize, requirePermission } from '../../middlewares/rbac';
import * as controller from './controller';

const router = Router();
router.use(authMiddleware);
router.get('/:code', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN', 'CLIENT']), controller.scanHandler);
router.post('/assign', authorize(['MERCHANT', 'ADMIN']), requirePermission('products', 'update'), controller.assignHandler);

export default router;
