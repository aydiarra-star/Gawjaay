import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { createHandler, updateStatusHandler, listHandler, getHandler } from './controller';

const router = Router();
router.use(authMiddleware);
router.post('/', authorize(['CLIENT','MERCHANT','ADMIN']), createHandler);
router.get('/', listHandler);
router.get('/:id', getHandler);
router.patch('/:id/status', authorize(['CLIENT','MERCHANT','EMPLOYEE','ADMIN']), updateStatusHandler);
export default router;
