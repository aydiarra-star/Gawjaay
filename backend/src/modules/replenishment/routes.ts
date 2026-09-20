import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import * as controller from './controller';

const router = Router();
router.use(authMiddleware, authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']));
router.get('/store/:storeId', controller.suggestionsHandler);
router.post('/store/:storeId/create-order', authorize(['MERCHANT', 'ADMIN']), controller.createOrderHandler);

export default router;
