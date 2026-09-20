import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import * as controller from './controller';

const router = Router();
router.use(authMiddleware);

// marchand : configuration + comptes de sa boutique
router.put('/store/:storeId/config', authorize(['MERCHANT', 'ADMIN']), controller.configureHandler);
router.get('/store/:storeId/accounts', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.storeAccountsHandler);
// client : son compte points par boutique
router.get('/store/:storeId/me', authorize(['CLIENT']), controller.myAccountHandler);

export default router;
