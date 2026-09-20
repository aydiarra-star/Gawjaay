import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import * as controller from './controller';

const router = Router();
router.use(authMiddleware);
router.post('/', authorize(['MERCHANT', 'ADMIN']), controller.createHandler);
router.get('/', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.listHandler);
router.patch('/:id', authorize(['MERCHANT', 'ADMIN']), controller.updateHandler);

export default router;
