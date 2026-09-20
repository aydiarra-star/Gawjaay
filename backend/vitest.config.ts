import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    fileParallelism: false, // chaque fichier a sa propre DB SQLite isolée
    testTimeout: 60000,
    hookTimeout: 120000,
    server: {
      deps: {
        external: [/node:sqlite/],
      },
    },
    deps: {
      optimizer: {
        ssr: {
          exclude: ['node:sqlite'],
        },
      },
    },
  },
  ssr: {
    external: ['node:sqlite'],
  },
  optimizeDeps: {
    exclude: ['node:sqlite'],
  },
});
