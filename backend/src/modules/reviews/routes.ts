import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import * as controller from './controller';

const router = Router();

// Public : avis boutique / produit
router.get('/store/:storeId', controller.storeHandler);
router.get('/product/:productId', controller.productHandler);

router.use(authMiddleware);
router.post('/', authorize(['CLIENT']), controller.createHandler);
router.get('/mine', authorize(['CLIENT']), controller.mineHandler);
router.post('/:id/report', authorize(['CLIENT', 'MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.reportHandler);

export default router;
