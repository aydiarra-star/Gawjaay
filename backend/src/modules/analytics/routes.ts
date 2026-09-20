import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import * as controller from './controller';

const router = Router();
router.use(authMiddleware);
router.get('/store/:storeId', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.storeHandler);

export default router;
