import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { initiateHandler, verifyHandler, webhookHandler, listHandler } from './controller';

const router = Router();

router.post('/webhook/:provider', webhookHandler); // no auth, but signature verified

router.use(authMiddleware);
router.post('/initiate', initiateHandler);
router.post('/:id/verify', verifyHandler);
router.get('/', listHandler);

export default router;
