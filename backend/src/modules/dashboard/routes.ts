import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { dashboardHandler, overviewHandler } from './controller';
const router = Router();
router.use(authMiddleware);
router.get('/store/:storeId', dashboardHandler);
router.get('/overview', overviewHandler);
export default router;
