import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import * as controller from './controller';

const router = Router();
router.use(authMiddleware, authorize(['CLIENT']));
router.post('/', controller.addHandler);
router.delete('/:targetType/:targetId', controller.removeHandler);
router.get('/', controller.listHandler);

export default router;
