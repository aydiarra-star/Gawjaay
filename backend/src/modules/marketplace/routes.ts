import { Router } from 'express';
import { searchProductsHandler, searchStoresHandler, nearbyHandler } from './controller';
const router = Router();
router.get('/products', searchProductsHandler);
router.get('/stores', searchStoresHandler);
router.get('/nearby', nearbyHandler);
export default router;
