// Baseline V1 — Tests unitaires (22+)
// Chaque fichier utilise sa propre DB isolée pour éviter tout conflit.
import { vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL = 'file:./test-v1-unit.db'; });

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { slugify, generateOrderNumber } from '../utils/slug';
import { phoneSchema, passwordSchema, registerSchema, saleCreateSchema, productCreateSchema } from '../utils/validators';
import { validateCart } from '../modules/cart/service';
import { canTransition } from '../modules/orders/service';
import { signAccess, verifyAccess, signRefresh, verifyRefresh } from '../utils/jwt';
import { env } from '../config/env';
import { SENEGAL_REGIONS } from '../modules/regions/service';
import { cuid } from '../lib/db';

describe('Baseline V1 — utils', () => {
  it('slugify : texte simple', () => {
    expect(slugify('Riz Brisé')).toBe('riz-brise');
  });
  it('slugify : accents supprimés', () => {
    expect(slugify('Café Thé À')).toBe('cafe-the-a');
  });
  it('slugify : caractères spéciaux', () => {
    expect(slugify('Huile* 5L!!')).toBe('huile-5l');
  });
  it('generateOrderNumber : format GJ-AAMMJJ-XXXX', () => {
    expect(generateOrderNumber()).toMatch(/^GJ-\d{6}-[A-Z0-9]{4}$/);
  });
  it('cuid : unique sur 1000 générations', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => cuid()));
    expect(ids.size).toBe(1000);
  });
});

describe('Baseline V1 — validation Zod', () => {
  it('phoneSchema accepte +221770000001', () => {
    expect(phoneSchema.safeParse('+221770000001').success).toBe(true);
  });
  it('phoneSchema refuse les lettres', () => {
    expect(phoneSchema.safeParse('abc123').success).toBe(false);
  });
  it('passwordSchema refuse < 8 caractères', () => {
    expect(passwordSchema.safeParse('court').success).toBe(false);
  });
  it('registerSchema refuse un rôle inconnu', () => {
    expect(registerSchema.safeParse({ phone: '+221770000001', password: 'Password123!', role: 'GOD' }).success).toBe(false);
  });
  it('saleCreateSchema refuse un panier vide', () => {
    expect(saleCreateSchema.safeParse({ storeId: 's1', items: [] }).success).toBe(false);
  });
  it('productCreateSchema refuse un prix négatif', () => {
    expect(productCreateSchema.safeParse({ name: 'X', price: -5 }).success).toBe(false);
  });
});

describe('Baseline V1 — panier serveur', () => {
  it('panier vide → erreur', () => {
    expect(validateCart([])).toBe('Panier vide');
  });
  it('panier multi-boutiques → erreur', () => {
    expect(validateCart([
      { productId: 'a', quantity: 1, storeId: 's1' },
      { productId: 'b', quantity: 1, storeId: 's2' },
    ])).toBe('Panier multi-boutiques non supporté en V1');
  });
  it('panier mono-boutique valide', () => {
    expect(validateCart([{ productId: 'a', quantity: 2, storeId: 's1' }])).toBeNull();
  });
});

describe('Baseline V1 — machine à états commande', () => {
  it('EN_ATTENTE → CONFIRMEE autorisée', () => {
    expect(canTransition('EN_ATTENTE', 'CONFIRMEE')).toBe(true);
  });
  it('EN_ATTENTE → LIVREE interdite', () => {
    expect(canTransition('EN_ATTENTE', 'LIVREE')).toBe(false);
  });
  it('LIVREE état final', () => {
    expect(canTransition('LIVREE', 'ANNULEE')).toBe(false);
  });
  it('PRETE → LIVREE autorisée', () => {
    expect(canTransition('PRETE', 'LIVREE')).toBe(true);
  });
});

describe('Baseline V1 — JWT', () => {
  it('sign/verify access roundtrip', () => {
    const t = signAccess({ userId: 'u1', role: 'MERCHANT' });
    expect(verifyAccess(t).userId).toBe('u1');
  });
  it('sign/verify refresh roundtrip', () => {
    const t = signRefresh({ userId: 'u1', sessionId: 's1' });
    expect(verifyRefresh(t).sessionId).toBe('s1');
  });
  it('token falsifié rejeté', () => {
    expect(() => verifyAccess('abc.def.ghi')).toThrow();
  });
});

describe('Baseline V1 — webhook HMAC & régions', () => {
  it('signature HMAC SHA-256 déterministe (webhook paiements)', () => {
    const payload = JSON.stringify({ orderId: 'o1', status: 'SUCCESS' });
    const sig = crypto.createHmac('sha256', env.WAVE_WEBHOOK_SECRET).update(payload).digest('hex');
    const sig2 = crypto.createHmac('sha256', env.WAVE_WEBHOOK_SECRET).update(payload).digest('hex');
    expect(sig).toBe(sig2);
    expect(sig).toHaveLength(64);
  });
  it('14 régions du Sénégal', () => {
    expect(SENEGAL_REGIONS.length).toBe(14);
  });
});
