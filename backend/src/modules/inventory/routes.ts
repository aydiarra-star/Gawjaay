import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize, requirePermission } from '../../middlewares/rbac';
import { stockHandler, adjustHandler, historyHandler, lowStockHandler } from './controller';

const router = Router();
router.use(authMiddleware);
router.get('/:storeId', authorize(['MERCHANT','EMPLOYEE','ADMIN']), stockHandler);
router.get('/:storeId/history', authorize(['MERCHANT','EMPLOYEE','ADMIN']), historyHandler);
router.get('/:storeId/low', authorize(['MERCHANT','EMPLOYEE','ADMIN']), lowStockHandler);
router.post('/:storeId/adjust', authorize(['MERCHANT','EMPLOYEE','ADMIN']), requirePermission('stock','update'), adjustHandler);

export default router;
