import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { isTest } from '../config/env.js';
import * as auth from '../services/auth.service.js';

const router = Router();

// Limite les tentatives de connexion (cahier §33). Désactivée en test pour ne pas fausser les suites.
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: { code: 'RATE_LIMITED', message: 'Trop de tentatives, réessayez dans une minute.' } },
});

const password = z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères').max(128);

const registerSchema = z.object({
  email: z.string().email(),
  password,
  fullName: z.string().min(2).max(120),
  phone: z.string().max(30).optional(),
  organizationName: z.string().min(2).max(120),
  storeName: z.string().min(2).max(120),
  region: z.string().max(60).optional(),
  city: z.string().max(60).optional(),
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().min(10) });
const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(10), password });
const changeSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });

router.post('/register', asyncHandler(async (req, res) => {
  const input = registerSchema.parse(req.body);
  const result = await auth.register(input);
  setRefreshCookie(res, result.refreshToken);
  res.status(201).json(result);
}));

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await auth.login(input.email, input.password);
  setRefreshCookie(res, result.refreshToken);
  res.json(result);
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const body = refreshSchema.partial().parse(req.body ?? {});
  const token = body.refreshToken ?? (req.cookies?.gj_refresh as string | undefined);
  if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Refresh token manquant' } });
  const result = await auth.refresh(token);
  setRefreshCookie(res, result.refreshToken);
  res.json(result);
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const token = (req.body?.refreshToken as string | undefined) ?? (req.cookies?.gj_refresh as string | undefined);
  if (token) await auth.logout(token);
  res.clearCookie('gj_refresh');
  res.json({ ok: true });
}));

router.post('/forgot-password', loginLimiter, asyncHandler(async (req, res) => {
  const input = forgotSchema.parse(req.body);
  const result = await auth.requestPasswordReset(input.email);
  res.json({ ok: true, ...(result.token ? { devToken: result.token } : {}) });
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const input = resetSchema.parse(req.body);
  await auth.resetPassword(input.token, input.password);
  res.json({ ok: true });
}));

router.post('/change-password', asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentification requise' } });
  const input = changeSchema.parse(req.body);
  await auth.changePassword(req.user.id, input.currentPassword, input.newPassword);
  res.json({ ok: true });
}));

function setRefreshCookie(res: import('express').Response, token: string) {
  res.cookie('gj_refresh', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export default router;
