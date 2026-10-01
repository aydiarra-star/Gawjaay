import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `base` est configurable via VITE_BASE_PATH pour l'hébergement GitHub Pages
 * (ex. /Gawjaay/). En local, la racine « / » est utilisée.
 */
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
  },
});
