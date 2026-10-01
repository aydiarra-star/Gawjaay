import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { randomId, sha256, signAccessToken, signRefreshToken } from '../lib/tokens.js';
import { env } from '../config/env.js';
import { audit } from '../lib/audit.js';

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  organizationName: string;
  storeName: string;
  region?: string;
  city?: string;
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'boutique';
}

async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  let slug = base;
  let i = 1;
  while (await exists(slug)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

/**
 * Inscription complète (cahier §11) : compte → entreprise → première boutique → dashboard.
 * Transactionnel : si une étape échoue, rien n'est créé.
 */
export async function register(input: RegisterInput) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw AppError.conflict('Un compte existe déjà avec cet email');

  const passwordHash = await hashPassword(input.password);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, passwordHash, fullName: input.fullName.trim(), phone: input.phone ?? null },
    });

    const orgSlug = await uniqueSlug(slugify(input.organizationName), async (s) =>
      Boolean(await tx.organization.findUnique({ where: { slug: s } })),
    );
    const organization = await tx.organization.create({
      data: {
        name: input.organizationName.trim(),
        slug: orgSlug,
        city: input.city ?? null,
        region: input.region ?? null,
      },
    });

    const storeSlug = await uniqueSlug(slugify(input.storeName), async (s) =>
      Boolean(await tx.store.findUnique({ where: { slug: s } })),
    );
    const store = await tx.store.create({
      data: {
        organizationId: organization.id,
        name: input.storeName.trim(),
        slug: storeSlug,
        city: input.city ?? null,
        region: input.region ?? null,
        isPublic: true,
      },
    });

    await tx.membership.create({
      data: { organizationId: organization.id, userId: user.id, role: 'OWNER' },
    });
    await tx.subscription.create({
      data: { organizationId: organization.id, plan: 'FREE', status: 'ACTIVE' },
    });

    return { user, organization, store };
  });

  const tokens = await issueTokens(result.user.id, result.user.email, result.user.platformAdmin);
  await audit({ organizationId: result.organization.id, userId: result.user.id, action: 'auth.register', entity: 'user', entityId: result.user.id });

  return {
    user: publicUser(result.user),
    organization: { id: result.organization.id, name: result.organization.name, slug: result.organization.slug },
    store: { id: result.store.id, name: result.store.name, slug: result.store.slug },
    ...tokens,
  };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Message identique que l'email existe ou non (anti-énumération).
  if (!user || !user.isActive) throw AppError.unauthorized('Identifiants invalides');
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw AppError.unauthorized('Identifiants invalides');

  const tokens = await issueTokens(user.id, user.email, user.platformAdmin);
  await audit({ userId: user.id, action: 'auth.login', entity: 'user', entityId: user.id });
  return { user: publicUser(user), ...tokens };
}

async function issueTokens(userId: string, email: string, platformAdmin: boolean) {
  const accessToken = signAccessToken({ sub: userId, email, platformAdmin });
  const jti = randomId();
  const refreshToken = signRefreshToken({ sub: userId, jti });
  const expiresAt = new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_EXPIRES));
  await prisma.refreshToken.create({ data: { userId, tokenHash: sha256(refreshToken), expiresAt } });
  return { accessToken, refreshToken };
}

/** Rotation du refresh token : révoque l'ancien et en émet un nouveau. */
export async function refresh(oldToken: string) {
  const { verifyRefreshToken } = await import('../lib/tokens.js');
  let payload: { sub: string; jti: string };
  try {
    payload = verifyRefreshToken(oldToken);
  } catch {
    throw AppError.unauthorized('Refresh token invalide ou expiré');
  }
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(oldToken) } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw AppError.unauthorized('Session expirée, reconnectez-vous');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw AppError.unauthorized('Compte indisponible');

  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  return issueTokens(user.id, user.email, user.platformAdmin);
}

export async function logout(refreshToken: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound('Utilisateur introuvable');
  const ok = await verifyPassword(current, user.passwordHash);
  if (!ok) throw AppError.badRequest('Mot de passe actuel incorrect');
  const passwordHash = await hashPassword(next);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ userId, action: 'auth.change_password', entity: 'user', entityId: userId });
}

/**
 * Demande de réinitialisation. Renvoie TOUJOURS le même résultat (anti-énumération).
 * Aucun envoi d'email réel n'est configuré : en développement, le jeton est retourné
 * pour permettre le test du flux ; en production il doit être transmis par email (non connecté).
 */
export async function requestPasswordReset(email: string): Promise<{ token?: string }> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return {};
  const token = randomId() + randomId();
  await prisma.passwordReset.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  await audit({ userId: user.id, action: 'auth.request_password_reset', entity: 'user', entityId: user.id });
  // En production : envoyer par email. Ici, le jeton n'est exposé qu'en environnement non-production.
  return env.NODE_ENV === 'production' ? {} : { token };
}

export async function resetPassword(token: string, newPassword: string) {
  const record = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw AppError.badRequest('Lien de réinitialisation invalide ou expiré');
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ userId: record.userId, action: 'auth.reset_password', entity: 'user', entityId: record.userId });
}

function publicUser(user: { id: string; email: string; fullName: string; phone: string | null; platformAdmin: boolean }) {
  return { id: user.id, email: user.email, fullName: user.fullName, phone: user.phone, platformAdmin: user.platformAdmin };
}

/** Convertit "15m"/"7d"/"3600" en millisecondes. */
function parseDurationMs(value: string): number {
  const match = /^(\d+)([smhd])?$/.exec(value.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  switch (match[2]) {
    case 's':
      return n * 1000;
    case 'm':
      return n * 60 * 1000;
    case 'h':
      return n * 60 * 60 * 1000;
    case 'd':
      return n * 24 * 60 * 60 * 1000;
    default:
      return n * 1000;
  }
}
