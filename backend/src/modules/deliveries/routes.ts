import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { listHandler, updateHandler, assignHandler } from './controller';
const router = Router();
router.use(authMiddleware);
router.get('/store/:storeId', listHandler);
router.patch('/:id/status', updateHandler);
router.post('/:id/assign', assignHandler);
export default router;
