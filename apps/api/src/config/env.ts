import { z } from 'zod';

/**
 * Configuration d'environnement validée au démarrage (fail-fast).
 * En production, les secrets JWT doivent être fournis et suffisamment longs.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL est requis'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-me-at-least-32-chars'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-change-me-at-least-32-chars'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  PAYMENTS_MODE: z.enum(['disabled', 'enabled']).default('disabled'),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuration d'environnement invalide: ${issues}`);
  }
  const env = parsed.data;

  if (env.NODE_ENV === 'production') {
    // Refuse les secrets de développement en production.
    const weak = ['dev-access-secret-change-me-at-least-32-chars', 'dev-refresh-secret-change-me-at-least-32-chars'];
    if (weak.includes(env.JWT_ACCESS_SECRET) || weak.includes(env.JWT_REFRESH_SECRET)) {
      throw new Error('Les secrets JWT de développement sont interdits en production.');
    }
    if (env.JWT_ACCESS_SECRET.length < 32 || env.JWT_REFRESH_SECRET.length < 32) {
      throw new Error('Les secrets JWT doivent faire au moins 32 caractères en production.');
    }
    // Aucun prestataire de paiement réel n'est connecté : le mode doit rester « disabled ».
    if (env.PAYMENTS_MODE === 'enabled') {
      throw new Error("PAYMENTS_MODE=enabled est refusé : aucun prestataire de paiement réel n'est configuré.");
    }
  }

  return env;
}

export const env: Env = load();
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
