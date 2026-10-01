import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/globalSetup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef012',
      JWT_ACCESS_EXPIRES: '15m',
      JWT_REFRESH_EXPIRES: '7d',
      FRONTEND_URL: 'http://localhost:5173',
      PAYMENTS_MODE: 'disabled',
    },
    // Base SQLite partagée : exécution séquentielle pour éviter les écritures concurrentes.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
