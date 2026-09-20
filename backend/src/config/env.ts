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
}
