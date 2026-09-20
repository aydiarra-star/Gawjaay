import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
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
