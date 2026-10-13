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

  /**
   * Régression : le formulaire d'inscription envoie les champs facultatifs
   * laissés vides sous forme de chaînes vides (et non de clés absentes).
   * Un compte « particulier » n'affiche ni entreprise ni boutique : ces chaînes
   * vides violaient `min(2)` et l'inscription échouait en 400 — le compte
   * n'était jamais créé. Ce test utilise exactement le payload du formulaire.
   */
  it('inscrit un compte particulier avec les champs entreprise/boutique vides (formulaire réel)', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      accountType: 'INDIVIDUAL',
      email: 'particulier@example.test',
      password: 'Password123!',
      fullName: 'Awa Ndiaye',
      phone: '',
      organizationName: '',
      storeName: '',
      region: 'Dakar',
      city: '',
    });

    expect(res.status).toBe(201);
    expect(res.body.organization).toBeNull();
    expect(res.body.store).toBeNull();
    expect(res.body.seller).toMatchObject({ sellerType: 'INDIVIDUAL' });
    expect(res.body.accessToken).toBeTruthy();

    // Le compte et le profil vendeur existent réellement en base.
    const user = await prisma.user.findUnique({ where: { email: 'particulier@example.test' } });
    expect(user).not.toBeNull();
    const seller = await prisma.sellerProfile.findUnique({ where: { userId: user!.id } });
    expect(seller?.sellerType).toBe('INDIVIDUAL');
    expect(seller?.organizationId).toBeNull();

    // Aucun téléphone inventé : la chaîne vide devient « non fourni ».
    expect(user!.phone).toBeNull();

    // Le compte créé peut se connecter et retrouver son profil vendeur.
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'particulier@example.test', password: 'Password123!' });
    expect(login.status).toBe(200);
    const sellers = await request(app).get('/api/v1/sellers').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(sellers.status).toBe(200);
    expect(sellers.body.sellers).toHaveLength(1);
  });

  it('normalise les champs facultatifs vides d’un compte boutique', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      accountType: 'BUSINESS',
      email: 'champs.vides@example.test',
      password: 'Password123!',
      fullName: 'Boutiquier Test',
      phone: '   ',
      organizationName: '  Boutique Vide  ',
      storeName: ' Boutique Centre ',
      region: '',
      city: '',
    });

    expect(res.status).toBe(201);
    // Les valeurs fournies sont détourées, les champs vides restent nuls.
    expect(res.body.organization.name).toBe('Boutique Vide');
    expect(res.body.store.name).toBe('Boutique Centre');
  });

  it('affiche un message explicite pour un mot de passe trop court', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'court@example.test',
      password: 'court',
      fullName: 'Owner Test',
      organizationName: 'Org A',
      storeName: 'Store A',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('8 caractères');
    expect(res.body.error.details).toContainEqual(
      expect.objectContaining({ path: 'password' }),
    );
  });

  it('affiche un message explicite pour un email invalide', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'pas-un-email',
      password: 'Password123!',
      fullName: 'Owner Test',
      organizationName: 'Org A',
      storeName: 'Store A',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Adresse email invalide');
    expect(res.body.error.details).toContainEqual(expect.objectContaining({ path: 'email' }));
  });

  it('affiche un message explicite quand un champ obligatoire manque', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      password: 'Password123!',
      fullName: 'Owner Test',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('email');
    // Jamais de message anglais brut de zod (« Required »).
    expect(res.body.error.message).not.toMatch(/required/i);
  });

  it("affiche un message explicite quand l'entreprise manque à un compte boutique", async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      accountType: 'BUSINESS',
      email: 'sans.entreprise@example.test',
      password: 'Password123!',
      fullName: 'Owner Test',
      organizationName: '',
      storeName: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('boutique');
  });

  it("affiche un message explicite quand l'email est déjà utilisé", async () => {
    const payload = {
      email: 'deja.pris@example.test',
      password: 'Password123!',
      fullName: 'Owner Test',
      organizationName: 'Org A',
      storeName: 'Store A',
    };
    await request(app).post('/api/v1/auth/register').send(payload).expect(201);
    const res = await request(app).post('/api/v1/auth/register').send(payload);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Un compte existe déjà avec cet email');
  });
});
