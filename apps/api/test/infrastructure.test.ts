import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './helpers.js';

/**
 * Vérifie les contrats d'infrastructure exposés publiquement :
 * health check (utilisé par l'hébergeur) et CORS (frontend GitHub Pages).
 */
describe('infrastructure', () => {
  it('GET /api/v1/health répond 200 avec un statut ok et un horodatage', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.time).toBe('string');
    expect(Number.isNaN(Date.parse(res.body.time))).toBe(false);
  });

  it('autorise l’origine frontend configurée (FRONTEND_URL) avec credentials', async () => {
    const origin = 'http://localhost:5173';
    const res = await request(app).get('/api/v1/health').set('Origin', origin);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('n’accorde pas l’en-tête CORS à une origine non autorisée', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('répond 404 JSON structuré sur une route inconnue', async () => {
    const res = await request(app).get('/api/v1/route-inexistante');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
