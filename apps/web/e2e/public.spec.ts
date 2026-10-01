import { expect, test } from '@playwright/test';

test.describe('pages publiques', () => {
  test('la page d\'accueil affiche la promesse et les accès', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Vendre vite. Gérer mieux.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Créer ma boutique' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explorer la marketplace' })).toBeVisible();
  });

  test('la marketplace se charge en direct (route SPA profonde)', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByRole('heading', { name: 'Marketplace' })).toBeVisible();
  });

  test('la boutique inconnue affiche une erreur propre, sans page blanche', async ({ page }) => {
    await page.goto('/shop/inexistant-' + Date.now());
    await expect(page.locator('.alert-error')).toBeVisible();
  });

  test('la page de connexion est accessible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('une route inconnue renvoie la page 404 de l\'application', async ({ page }) => {
    await page.goto('/cette-route-nexiste-pas');
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  });
});

test.describe('parcours marchand', () => {
  test('inscription → tableau de bord à zéro (aucune donnée fictive)', async ({ page }) => {
    const unique = Date.now();
    await page.goto('/register');
    await page.getByLabel('Nom complet').fill('Test Marchand');
    await page.getByLabel('Email').fill(`e2e.${unique}@gawjaay.test`);
    await page.getByLabel('Mot de passe (8 caractères minimum)').fill('Password123!');
    await page.getByLabel("Nom de l'entreprise").fill(`Entreprise ${unique}`);
    await page.getByLabel('Nom de la boutique').fill('Boutique Test');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
    // Aucune vente réelle : les indicateurs doivent afficher 0, pas de chiffres inventés.
    await expect(page.getByText("Aucune vente enregistrée sur cette période")).toBeVisible();
    await expect(page.getByText('0 FCFA').first()).toBeVisible();
  });
});
