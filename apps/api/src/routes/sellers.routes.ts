import { Router } from 'express';
import { z } from 'zod';
import { SELLER_TYPES, requiresOrganization } from '@gawjaay/shared';
import { asyncHandler } from '../lib/asyncHandler.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const sellerTypeEnum = z.enum(SELLER_TYPES);

const createSchema = z.object({
  sellerType: sellerTypeEnum,
  displayName: z.string().min(2).max(120),
  bio: z.string().max(600).optional(),
  phone: z.string().max(30).optional(),
  city: z.string().max(60).optional(),
  region: z.string().max(60).optional(),
  // Requis pour MERCHANT/BUSINESS : l'organisation existante du commerçant.
  organizationId: z.string().optional(),
});

const updateSchema = z.object({
  displayName: z.string().min(2).max(120).optional(),
  bio: z.string().max(600).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  city: z.string().max(60).optional().nullable(),
  region: z.string().max(60).optional().nullable(),
});

/** Vérifie que l'utilisateur est membre actif de l'organisation donnée. */
async function assertActiveMembership(userId: string, organizationId: string): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!membership || !membership.isActive) {
    throw AppError.forbidden('Accès à cette organisation refusé');
  }
}

/** Mes profils vendeur (un utilisateur n'en a qu'un). */
router.get('/', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const sellers = await prisma.sellerProfile.findMany({ where: { userId: req.user.id } });
  res.json({ sellers });
}));

/**
 * Crée mon profil vendeur. `sellerType` est déclaratif : aucune vérification
 * officielle n'est effectuée, et aucun statut « vérifié » n'est produit.
 * MERCHANT/BUSINESS exigent une organisation dont je suis membre actif ;
 * INDIVIDUAL peut exister sans organisation.
 */
router.post('/', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = createSchema.parse(req.body);

  const existing = await prisma.sellerProfile.findUnique({ where: { userId: req.user.id } });
  if (existing) throw AppError.conflict('Un profil vendeur existe déjà pour ce compte');

  let organizationId: string | null = null;
  if (requiresOrganization(input.sellerType)) {
    if (!input.organizationId) {
      throw AppError.badRequest('Une organisation est requise pour un vendeur commerçant ou entreprise');
    }
    await assertActiveMembership(req.user.id, input.organizationId);
    organizationId = input.organizationId;
  }

  const seller = await prisma.sellerProfile.create({
    data: {
      userId: req.user.id,
      sellerType: input.sellerType,
      status: 'ACTIVE',
      displayName: input.displayName,
      bio: input.bio ?? null,
      phone: input.phone ?? null,
      organizationId,
      city: input.city ?? null,
      region: input.region ?? null,
    },
  });

  await audit({
    organizationId,
    userId: req.user.id,
    action: 'seller.create',
    entity: 'sellerProfile',
    entityId: seller.id,
    meta: { sellerType: seller.sellerType },
  });

  res.status(201).json({ seller });
}));

/** Met à jour mon profil vendeur (ownership strict). */
router.patch('/:id', asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const input = updateSchema.parse(req.body);

  const seller = await prisma.sellerProfile.findUnique({ where: { id: req.params.id } });
  // 404 (et non 403) : ne pas divulguer l'existence d'un profil d'autrui.
  if (!seller || seller.userId !== req.user.id) throw AppError.notFound('Profil vendeur introuvable');

  const updated = await prisma.sellerProfile.update({ where: { id: seller.id }, data: input });
  await audit({ organizationId: seller.organizationId, userId: req.user.id, action: 'seller.update', entity: 'sellerProfile', entityId: seller.id });
  res.json({ seller: updated });
}));

export default router;
