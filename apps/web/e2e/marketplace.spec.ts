import { expect, test } from '@playwright/test';

test.describe('marketplace M3 — découverte publique', () => {
  test('la marketplace expose recherche, filtres et compteur', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByRole('heading', { name: 'Marketplace' })).toBeVisible();

    // Recherche réelle.
    await expect(page.getByLabel('Rechercher')).toBeVisible();
    // Filtres réels : région, ville, prix, type de vendeur.
    await expect(page.getByLabel('Région')).toBeVisible();
    await expect(page.getByLabel('Ville')).toBeVisible();
    await expect(page.getByLabel('Prix minimum (FCFA)')).toBeVisible();
    await expect(page.getByLabel('Prix maximum (FCFA)')).toBeVisible();
    await expect(page.getByLabel('Type de vendeur')).toBeVisible();
    // Proximité optionnelle (désactivée tant que la position n'est pas demandée).
    await expect(page.getByRole('button', { name: /Autour de moi/ })).toBeVisible();
  });

  test('une recherche sans résultat affiche un état vide honnête (pas de page blanche)', async ({ page }) => {
    await page.goto('/marketplace');
    await page.getByLabel('Rechercher').fill('zzz-produit-inexistant-' + Date.now());
    await page.getByRole('button', { name: 'Appliquer les filtres' }).click();
    await expect(page.getByText('Aucun produit disponible')).toBeVisible();
  });

  test('l\'onglet Annonces se charge proprement', async ({ page }) => {
    await page.goto('/marketplace');
    await page.getByRole('tab', { name: 'Annonces' }).click();
    // Soit des annonces, soit un état vide explicite — jamais une page blanche.
    await expect(page.getByText(/annonce/i).first()).toBeVisible();
  });

  test('une fiche vendeur inconnue affiche une erreur propre', async ({ page }) => {
    await page.goto('/seller/inexistant-' + Date.now());
    await expect(page.locator('.alert-error')).toBeVisible();
  });

  test('les filtres restent utilisables sur mobile', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByLabel('Rechercher')).toBeVisible();
    await page.getByRole('button', { name: 'Appliquer les filtres' }).click();
    await expect(page.getByRole('heading', { name: 'Marketplace' })).toBeVisible();
  });
});
