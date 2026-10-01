import { defineConfig, devices } from '@playwright/test';

/**
 * E2E : vérifie les parcours réels contre l'API et le build de production du web.
 * Les deux serveurs sont démarrés automatiquement par Playwright.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: [
    {
      command: 'cd ../api && node dist/server.js',
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        NODE_ENV: 'development',
        PORT: '4000',
        DATABASE_URL: 'file:./prisma/dev.db',
        JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789abcdef012345',
        JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789abcdef01234',
        FRONTEND_URL: 'http://localhost:4173',
        PAYMENTS_MODE: 'disabled',
      },
    },
    {
      command: 'npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
