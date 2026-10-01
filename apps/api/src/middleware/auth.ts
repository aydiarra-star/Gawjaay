import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';

/**
 * Authentification par jeton d'accès (en-tête `Authorization: Bearer <token>`
 * ou cookie httpOnly `gj_access`). Pose `req.user`.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    let token: string | undefined;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      token = header.slice(7).trim();
    } else if (req.cookies && typeof req.cookies.gj_access === 'string') {
      token = req.cookies.gj_access;
    }
    if (!token) throw AppError.unauthorized();

    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, platformAdmin: Boolean(payload.platformAdmin) };
    next();
  } catch {
    next(AppError.unauthorized('Jeton d\'accès invalide ou expiré'));
  }
}

/** Variante optionnelle : ne rejette pas si aucun jeton (utile pour routes publiques). */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (token) {
      const payload = verifyAccessToken(token);
      req.user = { id: payload.sub, email: payload.email, platformAdmin: Boolean(payload.platformAdmin) };
    }
  } catch {
    // ignoré : route publique
  }
  next();
}
