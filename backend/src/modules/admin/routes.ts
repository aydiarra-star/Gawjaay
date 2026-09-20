import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { usersHandler, storesHandler, ordersHandler, paymentsHandler, statsHandler, toggleUserHandler, verifyStoreHandler, auditHandler } from './controller';

const router = Router();
router.use(authMiddleware);
router.use(authorize(['ADMIN']));
router.get('/users', usersHandler);
router.get('/stores', storesHandler);
router.get('/orders', ordersHandler);
router.get('/payments', paymentsHandler);
router.get('/stats', statsHandler);
router.post('/users/:userId/toggle', toggleUserHandler);
router.post('/stores/:storeId/verify', verifyStoreHandler);
router.get('/audit-logs', auditHandler);
export default router;
