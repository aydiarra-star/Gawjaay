import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { listHandler, readHandler, readAllHandler } from './controller';
const router = Router();
router.use(authMiddleware);
router.get('/', listHandler);
router.patch('/:id/read', readHandler);
router.post('/read-all', readAllHandler);
export default router;
