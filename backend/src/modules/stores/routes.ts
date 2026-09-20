import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { createHandler, myStoresHandler, getBySlugHandler, getByIdHandler, updateHandler, publicListHandler } from './controller';

const router = Router();

router.get('/public', publicListHandler);
router.get('/slug/:slug', getBySlugHandler);

router.use(authMiddleware);
router.post('/', authorize(['MERCHANT','ADMIN']), createHandler);
router.get('/my', authorize(['MERCHANT','EMPLOYEE','ADMIN']), myStoresHandler);
router.get('/:id', getByIdHandler);
router.put('/:id', authorize(['MERCHANT','ADMIN']), updateHandler);

export default router;
