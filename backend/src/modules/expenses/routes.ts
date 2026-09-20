import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { createHandler, listHandler, summaryHandler } from './controller';
const router = Router();
router.use(authMiddleware);
router.post('/store/:storeId', createHandler);
router.get('/store/:storeId', listHandler);
router.get('/store/:storeId/summary', summaryHandler);
export default router;
