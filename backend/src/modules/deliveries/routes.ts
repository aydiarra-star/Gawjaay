import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import * as controller from './controller';

const router = Router();
router.use(authMiddleware);

// V1 (compat) : liste par boutique + statut legacy + assign employé legacy
router.get('/store/:storeId', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.listHandler);
router.patch('/:id/status', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.updateHandler);

// LOT E — flux livreur V2
router.get('/driver/me', authorize(['DRIVER']), controller.driverDeliveriesHandler);
router.patch('/:id/ready', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.readyHandler);
router.post('/:id/assign', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.assignHandlerV2);
router.patch('/:id/pickup', authorize(['DRIVER']), controller.pickupHandler);
router.patch('/:id/complete', authorize(['DRIVER', 'MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.completeHandler);
router.patch('/:id/fail', authorize(['DRIVER', 'MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.failHandler);
router.patch('/:id/cancel', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.cancelHandler);
router.get('/:id/proofs', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.proofsHandler);

export default router;
