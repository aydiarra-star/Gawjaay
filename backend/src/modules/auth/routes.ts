import { Router } from 'express';
import { registerHandler, loginHandler, refreshHandler, logoutHandler, meHandler, changePasswordHandler } from './controller';
import { authMiddleware } from '../../middlewares/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

const loginLimiter = rateLimit({ windowMs: 60*1000, max: 5, message: { error: 'Trop de tentatives, réessayez dans 1 min' } });

router.post('/register', registerHandler);
router.post('/login', loginLimiter, loginHandler);
router.post('/refresh', refreshHandler);
router.post('/logout', logoutHandler);
router.get('/me', authMiddleware, meHandler);
router.post('/change-password', authMiddleware, changePasswordHandler);

export default router;
