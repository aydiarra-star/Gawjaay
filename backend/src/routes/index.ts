import { Router } from 'express';
import authRoutes from '../modules/auth/routes';
import storeRoutes from '../modules/stores/routes';
import productRoutes from '../modules/products/routes';
import inventoryRoutes from '../modules/inventory/routes';
import salesRoutes from '../modules/sales/routes';
import customerRoutes from '../modules/customers/routes';
import debtRoutes from '../modules/debts/routes';
import supplierRoutes from '../modules/suppliers/routes';
import expenseRoutes from '../modules/expenses/routes';
import dashboardRoutes from '../modules/dashboard/routes';
import orderRoutes from '../modules/orders/routes';
import paymentRoutes from '../modules/payments/routes';
import deliveryRoutes from '../modules/deliveries/routes';
import marketplaceRoutes from '../modules/marketplace/routes';
import notificationRoutes from '../modules/notifications/routes';
import employeeRoutes from '../modules/employees/routes';
import adminRoutes from '../modules/admin/routes';
import regionRoutes from '../modules/regions/routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/stores', storeRoutes);
router.use('/products', productRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/sales', salesRoutes);
router.use('/customers', customerRoutes);
router.use('/debts', debtRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/expenses', expenseRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/deliveries', deliveryRoutes);
router.use('/marketplace', marketplaceRoutes);
router.use('/notifications', notificationRoutes);
router.use('/employees', employeeRoutes);
router.use('/admin', adminRoutes);
router.use('/regions', regionRoutes);

router.get('/health', (req, res) => res.json({ status: 'ok', service: 'GawJaay API', version: '1.0.0', timestamp: new Date().toISOString() }));

export default router;
