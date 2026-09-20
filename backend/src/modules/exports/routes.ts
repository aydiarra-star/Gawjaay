import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import * as controller from './controller';

const router = Router();
router.use(authMiddleware);
router.get('/:type/store/:storeId', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.csvHandler);

export default router;
