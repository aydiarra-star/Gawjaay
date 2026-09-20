import dotenv from 'dotenv';
dotenv.config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || 'file:./dev.db',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me-32chars-long',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me-32chars-long',
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '15m',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || '7d',
  PORT: parseInt(process.env.PORT || '4000', 10),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  WAVE_API_KEY: process.env.WAVE_API_KEY || 'sandbox_wave_key',
  WAVE_WEBHOOK_SECRET: process.env.WAVE_WEBHOOK_SECRET || 'sandbox_wave_webhook_secret',
  OM_API_KEY: process.env.OM_API_KEY || 'sandbox_om_key',
  OM_WEBHOOK_SECRET: process.env.OM_WEBHOOK_SECRET || 'sandbox_om_secret',
  NODE_ENV: process.env.NODE_ENV || 'development',
  SENTRY_DSN: process.env.SENTRY_DSN || '',
  /**
   * Mode paiements mobiles (WAVE / ORANGE_MONEY / CARD) :
   *  - `sandbox`  : fournisseurs simulés côté serveur (dev / tests / démo) — JAMAIS en production ;
   *  - `disabled` : aucun fournisseur connecté → les paiements mobiles répondent 503, seul CASH (encaissement
   *                 confirmé par le marchand) reste possible. Valeur par défaut en production.
   * Aucun fournisseur de paiement de production n'est intégré dans ce dépôt (NOT CONNECTED TO PRODUCTION
   * PAYMENT PROVIDER) : un vrai connecteur devra implémenter `PaymentProvider` (modules/payments/service.ts).
   */
  PAYMENTS_MODE: (process.env.PAYMENTS_MODE || (process.env.NODE_ENV === 'production' ? 'disabled' : 'sandbox')) as 'sandbox' | 'disabled',
};

if (env.JWT_ACCESS_SECRET.length < 20) {
  console.warn('JWT secrets too short');
}
// PRODUCTION : refuse de démarrer avec les secrets de développement (fail-fast).
if (env.NODE_ENV === 'production') {
  const devDefaults = [
    'dev-access-secret-change-me-32chars-long',
    'dev-refresh-secret-change-me-32chars-long',
  ];
  if (devDefaults.includes(env.JWT_ACCESS_SECRET) || devDefaults.includes(env.JWT_REFRESH_SECRET)) {
    throw new Error('PRODUCTION : JWT_ACCESS_SECRET / JWT_REFRESH_SECRET doivent être définis dans l environnement (pas de défaut de dev).');
  }
  // Les fournisseurs simulés valident n'importe quel paiement : interdits en production (fail-fast).
  if (env.PAYMENTS_MODE !== 'disabled') {
    throw new Error('PRODUCTION : PAYMENTS_MODE=sandbox est interdit (aucun fournisseur de paiement réel n est connecté). Utiliser PAYMENTS_MODE=disabled.');
  }
}
if (!['sandbox', 'disabled'].includes(env.PAYMENTS_MODE)) {
  throw new Error(`PAYMENTS_MODE invalide : ${env.PAYMENTS_MODE} (attendu sandbox | disabled)`);
}
