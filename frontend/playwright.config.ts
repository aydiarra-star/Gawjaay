import { defineConfig, devices } from '@playwright/test';

/**
 * E2E GawJaay — parcours réels (mission production readiness §3 & §13).
 * Backend API (port 4000, DB seedée) + frontend buildé en mode preview (port 4173).
 * En CI : chromium installé par le workflow ; en local : reuseExistingServer.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // 'github' : annotations lisibles via l'API checks (les logs bruts sont bloqués depuis Arena)
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // CLIENT : parcours mobile-first (cahier : mobile-first)
    { name: 'client-mobile', use: { ...devices['Pixel 7'] } },
    // MERCHANT / ADMIN : desktop
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'npx tsx scripts/seed-demo.ts && npx tsx src/index.ts',
      port: 4000,
      cwd: '../backend',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      // NODE_ENV=test : désactive les rate-limits login/assistant pour les connexions E2E (CI uniquement)
      env: { NODE_ENV: 'test' },
    },
    {
      command: 'npm run build && npx vite preview --port 4173 --strictPort',
      port: 4173,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
