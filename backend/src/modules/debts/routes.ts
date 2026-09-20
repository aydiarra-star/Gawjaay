import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { listHandler, payHandler, getHandler } from './controller';
const router = Router();
router.use(authMiddleware);
router.get('/store/:storeId', listHandler);
router.get('/:id', getHandler);
router.post('/:id/pay', payHandler);
export default router;
