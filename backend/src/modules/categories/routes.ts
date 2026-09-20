import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { listHandler, getHandler, createHandler, updateHandler, deleteHandler } from './controller';

const router = Router();
// Lecture publique (marketplace, vitrine, formulaires marchands)
router.get('/', listHandler);
router.get('/:idOrSlug', getHandler);
// Écriture : référentiel plateforme → ADMIN uniquement (cahier §7.5)
router.post('/', authMiddleware, authorize(['ADMIN']), createHandler);
router.put('/:id', authMiddleware, authorize(['ADMIN']), updateHandler);
router.delete('/:id', authMiddleware, authorize(['ADMIN']), deleteHandler);
export default router;
