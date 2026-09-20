import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { initiateHandler, verifyHandler, webhookHandler, listHandler, capabilitiesHandler, confirmCashHandler } from './controller';

const router = Router();

router.post('/webhook/:provider', webhookHandler); // no auth, but signature verified
router.get('/capabilities', capabilitiesHandler); // public : modes réellement disponibles (jamais de promesse)

router.use(authMiddleware);
router.post('/initiate', initiateHandler);
router.post('/:id/verify', verifyHandler);
router.post('/:id/confirm-cash', authorize(['MERCHANT','EMPLOYEE','ADMIN']), confirmCashHandler);
router.get('/', listHandler);

export default router;
