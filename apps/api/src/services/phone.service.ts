import { randomInt } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { sha256 } from '../lib/tokens.js';

/**
 * Vérification du téléphone par code (OTP) — FONDATIONS.
 *
 * Aucun fournisseur SMS n'est connecté dans ce dépôt : le code n'est jamais
 * livré automatiquement et `User.phoneVerified` n'est JAMAIS posé sans qu'un
 * code correct ait été validé. Une intégration SMS réelle pourra plus tard
 * consommer `requestPhoneVerification` (déclenchement de l'envoi) et
 * `verifyPhoneCode` (validation), sans changer ce contrat.
 */

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

/** Normalise un numéro sénégalais simple (chiffres, + éventuel). */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, '');
}

/**
 * Crée une demande de vérification. Renvoie `delivered: false` de façon
 * explicite : aucun envoi simulé. Le code en clair n'est jamais renvoyé par
 * l'API (seul le hash est conservé).
 */
export async function requestPhoneVerification(userId: string, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (phone.length < 8) throw AppError.badRequest('Numéro de téléphone invalide');

  // Invalide les demandes précédentes encore en attente.
  await prisma.phoneVerification.updateMany({
    where: { userId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await prisma.phoneVerification.create({
    data: { userId, phone, codeHash: sha256(code), expiresAt },
  });

  return { delivered: false, expiresAt, phone };
}

/**
 * Valide un code. À la réussite seulement : statut VERIFIED et
 * `User.phoneVerified = true`. Refuse les codes expirés ou après trop d'essais.
 */
export async function verifyPhoneCode(userId: string, code: string) {
  const pending = await prisma.phoneVerification.findFirst({
    where: { userId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending) throw AppError.badRequest('Aucune vérification en attente');

  if (pending.expiresAt.getTime() < Date.now()) {
    await prisma.phoneVerification.update({ where: { id: pending.id }, data: { status: 'EXPIRED' } });
    throw AppError.badRequest('Code expiré, demandez-en un nouveau');
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    await prisma.phoneVerification.update({ where: { id: pending.id }, data: { status: 'CANCELLED' } });
    throw AppError.conflict('Trop de tentatives, demandez un nouveau code');
  }

  if (sha256(code) !== pending.codeHash) {
    await prisma.phoneVerification.update({ where: { id: pending.id }, data: { attempts: pending.attempts + 1 } });
    throw AppError.badRequest('Code incorrect');
  }

  await prisma.$transaction([
    prisma.phoneVerification.update({
      where: { id: pending.id },
      data: { status: 'VERIFIED', verifiedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { phone: pending.phone, phoneVerified: true },
    }),
  ]);

  return { phoneVerified: true, phone: pending.phone };
}
