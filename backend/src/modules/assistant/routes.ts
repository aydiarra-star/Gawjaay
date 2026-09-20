import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import * as controller from './controller';

/**
 * LOT F — Assistant IA. Rate-limit dédié : le moteur est déterministe et local,
 * mais on borne l'usage par utilisateur (protection anti-abus, cahier §sécurité).
 */
const askLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Trop de questions à l assistant, réessayez dans 15 min' },
});

const router = Router();
router.use(authMiddleware);

router.post('/ask/:storeId', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), askLimiter, controller.askHandler);
router.get('/history/:storeId', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.historyHandler);
router.post('/actions', authorize(['MERCHANT', 'ADMIN']), controller.requestActionHandler);
router.post('/actions/:id/confirm', authorize(['MERCHANT', 'ADMIN']), controller.confirmActionHandler);
router.get('/actions/store/:storeId', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.listActionsHandler);

export default router;
