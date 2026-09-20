import { Request, Response, NextFunction } from 'express';
import { registerSchema, loginSchema } from '../../utils/validators';
import * as service from './service';
import { AuthRequest } from '../../middlewares/auth';
import db from '../../lib/db';

export async function registerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = registerSchema.parse(req.body);
    const result = await service.register(data as any);
    res.status(201).json(result);
  } catch (e) { next(e); }
}

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { phone, password } = loginSchema.parse(req.body);
    const result = await service.login(phone, password, req.ip, req.headers['user-agent']);
    res.cookie('refreshToken', result.refreshToken, { httpOnly: true, secure: false, sameSite: 'lax', maxAge: 7*24*3600*1000 });
    res.json(result);
  } catch (e) { next(e); }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const token = (req as any).cookies?.refreshToken || req.body.refreshToken;
    if (!token) return res.status(401).json({ error: 'Refresh manquant' });
    const result = await service.refresh(token);
    res.json(result);
  } catch (e) { next(e); }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const token = (req as any).cookies?.refreshToken || req.body.refreshToken;
    if (token) await service.logout(token);
    res.clearCookie('refreshToken');
    res.json({ message: 'Déconnecté' });
  } catch (e) { next(e); }
}

export async function meHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user) return res.status(404).json({ error: 'Non trouvé' });
    const merchant = db.prepare('SELECT * FROM merchants WHERE userId = ?').get(userId) as any;
    let stores: any[] = [];
    if (merchant) stores = db.prepare('SELECT * FROM stores WHERE merchantId = ?').all(merchant.id);
    res.json({ ...user, merchant: merchant ? { ...merchant, stores } : null });
  } catch (e) { next(e); }
}

export async function changePasswordHandler(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { oldPassword, newPassword } = req.body;
    await service.changePassword(req.user!.userId, oldPassword, newPassword);
    res.json({ message: 'Mot de passe changé' });
  } catch (e) { next(e); }
}
