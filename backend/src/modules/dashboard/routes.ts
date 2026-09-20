import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { dashboardHandler, overviewHandler } from './controller';
const router = Router();
router.use(authMiddleware);
router.get('/store/:storeId', authorize(['MERCHANT','EMPLOYEE','ADMIN']), dashboardHandler);
router.get('/overview', authorize(['MERCHANT','ADMIN']), overviewHandler);
export default router;
