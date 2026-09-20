import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import * as controller from './controller';

// Toutes les routes de modération sont réservées ADMIN (montées sous /admin).
const router = Router();
router.use(authMiddleware, authorize(['ADMIN']));

router.get('/reviews', controller.listReviewsHandler);
router.post('/reviews/:id/hide', controller.hideHandler);
router.post('/reviews/:id/restore', controller.restoreHandler);
router.delete('/reviews/:id', controller.deleteHandler);
router.get('/review-reports', controller.reportsHandler);
router.post('/review-reports/:id/resolve', controller.resolveReportHandler);
router.get('/moderation-actions', controller.actionsHandler);

export default router;
