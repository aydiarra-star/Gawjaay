import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { requestPhoneVerification, verifyPhoneCode } from '../services/phone.service.js';

const router = Router();
router.use(authenticate);

/** Statut de vérification du téléphone de l'utilisateur courant. */
router.get('/phone', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { phone: true, phoneVerified: true },
  });
  res.json({ phone: user?.phone ?? null, phoneVerified: Boolean(user?.phoneVerified) });
}));

/**
 * Demande un code de vérification. Aucun fournisseur SMS n'étant connecté, la
 * réponse indique honnêtement `delivered: false` : aucun envoi n'est simulé.
 */
router.post('/phone/request', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = z.object({ phone: z.string().min(8).max(30) }).parse(req.body);
  const result = await requestPhoneVerification(req.user.id, input.phone);
  res.json({
    ...result,
    notice: "Aucun fournisseur SMS n'est connecté : le code n'est pas envoyé automatiquement. Branchez un envoi réel pour l'utiliser en production.",
  });
}));

/** Valide le code. Seule cette étape peut positionner phoneVerified=true. */
router.post('/phone/verify', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = z.object({ code: z.string().min(4).max(8) }).parse(req.body);
  const result = await verifyPhoneCode(req.user.id, input.code);
  res.json(result);
}));

export default router;
