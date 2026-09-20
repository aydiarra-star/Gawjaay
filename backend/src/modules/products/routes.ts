import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize, requirePermission } from '../../middlewares/rbac';
import { createHandler, listHandler, updateHandler, deleteHandler, getHandler } from './controller';

const router = Router();

router.get('/store/:storeId', listHandler);
router.get('/:productId', getHandler);

router.use(authMiddleware);
router.post('/store/:storeId', authorize(['MERCHANT','EMPLOYEE','ADMIN']), requirePermission('products','create'), createHandler);
router.put('/:productId', authorize(['MERCHANT','EMPLOYEE','ADMIN']), requirePermission('products','update'), updateHandler);
router.delete('/:productId', authorize(['MERCHANT','ADMIN']), requirePermission('products','delete'), deleteHandler);

export default router;
