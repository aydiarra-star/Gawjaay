import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import * as controller from './controller';

const router = Router();
router.use(authMiddleware);

// profils B2B
router.post('/profile', authorize(['MERCHANT', 'ADMIN']), controller.upsertProfileHandler);
router.get('/profile/me', authorize(['MERCHANT', 'ADMIN']), controller.myProfileHandler);

// catalogues professionnels
router.post('/catalogs', authorize(['MERCHANT', 'ADMIN']), controller.createCatalogHandler);
router.get('/catalogs/mine', authorize(['MERCHANT', 'ADMIN']), controller.myCatalogsHandler);
router.get('/catalogs', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.publicCatalogsHandler);
router.get('/catalogs/:id', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.getCatalogHandler);
router.post('/catalogs/:id/items', authorize(['MERCHANT', 'ADMIN']), controller.addItemHandler);

// commandes professionnelles
router.post('/orders', authorize(['MERCHANT', 'ADMIN']), controller.createOrderHandler);
router.get('/orders', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.listOrdersHandler);
router.get('/orders/:id', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.getOrderHandler);
router.patch('/orders/:id/status', authorize(['MERCHANT', 'EMPLOYEE', 'ADMIN']), controller.statusHandler);

export default router;
