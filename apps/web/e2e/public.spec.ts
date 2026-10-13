import { expect, test } from '@playwright/test';

test.describe('pages publiques', () => {
  test('la page d\'accueil affiche la promesse et les accès', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Vendre vite\.\s*Gérer mieux\./ })).toBeVisible();
    // La CTA principale est présente dans le héros (le libellé apparaît aussi en en-tête et pied de page).
    await expect(page.getByRole('main').getByRole('link', { name: 'Créer ma boutique' })).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: 'Explorer la marketplace' })).toBeVisible();
  });

  test('la navbar reste alignée sur mobile et le bandeau défile vers la droite', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');

    const header = page.locator('.landing-topbar');
    await expect(header.getByRole('link', { name: 'Connexion' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Créer ma boutique' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Marketplace' })).toBeHidden();

    const [headerBox, logoBox, loginBox, createBox, tickerBox] = await Promise.all([
      header.boundingBox(),
      header.locator('.brand').boundingBox(),
      header.getByRole('link', { name: 'Connexion' }).boundingBox(),
      header.getByRole('link', { name: 'Créer ma boutique' }).boundingBox(),
      page.locator('.announcement-ticker').boundingBox(),
    ]);
    if (!headerBox || !logoBox || !loginBox || !createBox || !tickerBox) {
      throw new Error('Éléments de navigation ou bandeau introuvables.');
    }

    const logoCenter = logoBox.y + logoBox.height / 2;
    const loginCenter = loginBox.y + loginBox.height / 2;
    const createCenter = createBox.y + createBox.height / 2;
    expect(Math.abs(logoCenter - loginCenter)).toBeLessThanOrEqual(1);
    expect(Math.abs(loginCenter - createCenter)).toBeLessThanOrEqual(1);
    expect(loginBox.x + loginBox.width).toBeLessThan(createBox.x);
    expect(createBox.x + createBox.width).toBeLessThanOrEqual(320);
    expect(tickerBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height - 1);

    const track = page.locator('.announcement-track');
    await expect(track).toHaveCSS('direction', 'ltr');
    const offsets = await track.evaluate(async (element) => {
      const animation = element.getAnimations()[0];
      if (!animation) return null;
      animation.pause();
      await animation.ready;
      animation.currentTime = 0;
      const startX = new DOMMatrixReadOnly(getComputedStyle(element).transform).m41;
      animation.currentTime = 1_000;
      const endX = new DOMMatrixReadOnly(getComputedStyle(element).transform).m41;
      return { startX, endX };
    });
    if (!offsets) throw new Error('Le bandeau devrait avoir une animation active.');
    expect(offsets.endX).toBeGreaterThan(offsets.startX);
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
    // Accueil marchand : le tableau de bord affiche le chiffre d'affaires réel (0 au départ).
    await expect(page.getByText("Chiffre d'affaires").first()).toBeVisible();
    // Aucune vente réelle : les indicateurs doivent afficher 0, pas de chiffres inventés.
    await expect(page.getByText('Aucune vente sur cette période')).toBeVisible();
    await expect(page.getByText('0 FCFA').first()).toBeVisible();
  });
});
