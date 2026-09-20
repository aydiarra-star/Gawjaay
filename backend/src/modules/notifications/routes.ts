import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { listHandler, readHandler, readAllHandler, unreadHandler, channelsHandler } from './controller';
const router = Router();
router.use(authMiddleware);
router.get('/', listHandler);
router.get('/unread', unreadHandler);
// V3 : état réel des canaux (INTERNAL actif ; EMAIL/SMS/WHATSAPP/PUSH déclarés NOT_CONNECTED, jamais simulés)
router.get('/channels', channelsHandler);
router.patch('/:id/read', readHandler);
router.post('/read-all', readAllHandler);
export default router;
