import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, resetDb } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe('auth', () => {
  it('inscrit un compte et crée organisation + boutique + propriétaire', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'owner@example.test',
      password: 'Password123!',
      fullName: 'Owner Test',
      organizationName: 'Ma Boutique',
      storeName: 'Boutique Centre',
      region: 'Dakar',
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.organization.slug).toBe('ma-boutique');

    const membership = await prisma.membership.findFirst({ where: { organizationId: res.body.organization.id } });
    expect(membership?.role).toBe('OWNER');
  });

  it('refuse un email déjà utilisé', async () => {
    const payload = {
      email: 'dup@example.test',
      password: 'Password123!',
      fullName: 'Owner Test',
      organizationName: 'Org A',
      storeName: 'Store A',
    };
    await request(app).post('/api/v1/auth/register').send(payload);
    const res = await request(app).post('/api/v1/auth/register').send(payload);
    expect(res.status).toBe(409);
  });

  it('valide la robustesse du mot de passe', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'weak@example.test',
      password: 'short',
      fullName: 'Owner Test',
      organizationName: 'Org A',
      storeName: 'Store A',
    });
    expect(res.status).toBe(400);
  });

  it('connecte avec de bons identifiants et refuse les mauvais', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'login@example.test',
      password: 'Password123!',
      fullName: 'Owner Test',
      organizationName: 'Org A',
      storeName: 'Store A',
    });

    const ok = await request(app).post('/api/v1/auth/login').send({ email: 'login@example.test', password: 'Password123!' });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();

    const bad = await request(app).post('/api/v1/auth/login').send({ email: 'login@example.test', password: 'WrongPass1!' });
    expect(bad.status).toBe(401);
  });

  it("ne révèle pas si l'email existe (anti-énumération)", async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'inconnu@example.test', password: 'Password123!' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Identifiants invalides');
  });

  it('fait tourner le refresh token et révoque l\'ancien', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({
      email: 'refresh@example.test',
      password: 'Password123!',
      fullName: 'Owner Test',
      organizationName: 'Org A',
      storeName: 'Store A',
    });
    const oldToken = reg.body.refreshToken;

    const refreshed = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: oldToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(oldToken);

    // L'ancien token ne doit plus fonctionner (rotation).
    const reuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: oldToken });
    expect(reuse.status).toBe(401);
  });

  it('réinitialise le mot de passe avec un jeton valide (usage unique)', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'reset@example.test',
      password: 'Password123!',
      fullName: 'Owner Test',
      organizationName: 'Org A',
      storeName: 'Store A',
    });

    const forgot = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'reset@example.test' });
    expect(forgot.status).toBe(200);
    const token = forgot.body.devToken;
    expect(token).toBeTruthy();

    const reset = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'NewPassword123!' });
    expect(reset.status).toBe(200);

    const login = await request(app).post('/api/v1/auth/login').send({ email: 'reset@example.test', password: 'NewPassword123!' });
    expect(login.status).toBe(200);

    const reuse = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'OtherPassword123!' });
    expect(reuse.status).toBe(400);
  });

  it('protège les routes authentifiées sans jeton', async () => {
    const res = await request(app).get('/api/v1/organizations');
    expect(res.status).toBe(401);
  });
});
