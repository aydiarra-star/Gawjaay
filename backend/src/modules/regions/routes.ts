import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { listHandler, seedHandler, departmentsHandler, communesHandler } from './controller';
const router = Router();
router.get('/', listHandler);
router.get('/departments', departmentsHandler);
router.get('/departments/:departmentId/communes', communesHandler);
// V3 (audit S11) : le seed géographique est réservé à l'ADMIN (idempotent, mais écriture en base)
router.post('/seed', authMiddleware, authorize(['ADMIN']), seedHandler);
export default router;
