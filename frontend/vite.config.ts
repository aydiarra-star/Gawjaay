import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * base : '/' en local/VPS ; '/<repo>/' sur GitHub Pages (sous-chemin), fourni par VITE_BASE au build.
 * Voir .github/workflows/deploy-pages.yml.
 */
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['.e2b.app'],
    proxy: {
      '/api': process.env.VITE_DEV_API_TARGET || 'http://localhost:4000'
    }
  }
});
