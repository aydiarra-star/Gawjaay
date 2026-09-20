import { Router } from 'express';
import { listHandler, seedHandler } from './controller';
const router = Router();
router.get('/', listHandler);
router.post('/seed', seedHandler);
export default router;
