import { expect, test } from '@playwright/test';

/**
 * Parcours marchand complet : Produit → Photo → Stock initial → Entrée de stock
 * → Vente → Stock décrémenté → Tableau de bord. Exécuté sur desktop et mobile.
 */

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAJUlEQVR4nGNgYGCQk5OzsbGJioqqqKiYNm3ali1bLl26xDC0JABjG07Bu/EhPgAAAABJRU5ErkJggg==',
  'base64',
);

async function register(page: import('@playwright/test').Page, unique: number) {
  await page.goto('/register');
  await page.getByLabel('Nom complet').fill('Boutiquier Test');
  await page.getByLabel('Email').fill(`merchant.${unique}@gawjaay.test`);
  await page.getByLabel('Mot de passe (8 caractères minimum)').fill('Password123!');
  await page.getByLabel("Nom de l'entreprise").fill(`Boutique ${unique}`);
  await page.getByLabel('Nom de la boutique').fill('Boutique Riz');
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test.describe('parcours marchand — produit, stock, vente', () => {
  test('crée un produit avec photo, ajoute du stock puis vend', async ({ page }) => {
    const unique = Date.now();
    await register(page, unique);

    /* ── Ajouter un produit ── */
    await page.goto('/app/products');
    await page.getByRole('button', { name: '+ Ajouter un produit' }).first().click();

    // Photo depuis la galerie (le second champ fichier).
    await page.locator('input[type="file"]').nth(1).setInputFiles({ name: 'riz.png', mimeType: 'image/png', buffer: PNG_1PX });
    await expect(page.getByAltText('Aperçu de la photo du produit')).toBeVisible();

    await page.getByLabel('Nom du produit').fill('Riz');
    await page.getByLabel('Catégorie (optionnel)').fill('Alimentaire');
    await page.getByLabel('Format (optionnel)').fill('50 kg');
    await page.getByLabel("Prix d'achat (FCFA)").fill('12000');
    await page.getByLabel('Prix de vente (FCFA)').fill('14000');
    await page.getByLabel('Stock initial').fill('10');
    await page.getByLabel("Seuil d'alerte (optionnel)").fill('2');
    await page.getByLabel('Variante (optionnel)').fill('Sac 50 kg');

    await page.getByRole('button', { name: 'Enregistrer le produit' }).click();
    await expect(page.getByRole('dialog').getByText('Produit enregistré')).toBeVisible();
    await page.getByRole('button', { name: 'Terminé' }).click();

    // Le produit apparaît avec son stock et son prix.
    const card = page.locator('.merchant-card', { hasText: 'Riz' }).first();
    await expect(card).toContainText('Sac · 50 kg');
    await expect(card).toContainText('10 sacs');
    await expect(card).toContainText('14 000 FCFA');

    /* ── Ajouter du stock : 10 → 15 ── */
    await page.goto('/app/stock');
    const stockCard = page.locator('.stock-card', { hasText: 'Riz' }).first();
    await expect(stockCard).toContainText('10 sacs');
    await stockCard.getByRole('button', { name: '+ Ajouter du stock' }).click();
    await page.getByLabel(/Quantité reçue/).fill('5');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('.stock-card', { hasText: 'Riz' }).first()).toContainText('15 sacs');
    // L'historique reflète de vrais mouvements.
    await expect(page.getByText('Entrée de stock').first()).toBeVisible();
    await expect(page.getByText('Stock initial').first()).toBeVisible();

    /* ── Vendre 1 sac : 15 → 14 ── */
    await page.goto('/app/pos');
    const posCard = page.locator('.merchant-card', { hasText: 'Riz' }).first();
    await expect(posCard).toContainText('15 sacs');
    await posCard.getByRole('button', { name: /Sac 50 kg/ }).click();
    await page.getByRole('button', { name: 'Encaisser' }).click();
    await expect(page.locator('.alert-success')).toContainText('14 000 FCFA');

    /* ── Stock décrémenté ── */
    await page.goto('/app/stock');
    await expect(page.locator('.stock-card', { hasText: 'Riz' }).first()).toContainText('14 sacs');

    /* ── Tableau de bord mis à jour ── */
    await page.goto('/app');
    await expect(page.locator('.stat-hero')).toContainText('14 000 FCFA');
  });

  test('refuse la vente au-delà du stock disponible', async ({ page }) => {
    const unique = Date.now();
    await register(page, unique);

    await page.goto('/app/products');
    await page.getByRole('button', { name: '+ Ajouter un produit' }).first().click();
    await page.getByLabel('Nom du produit').fill('Sucre');
    await page.getByLabel('Prix de vente (FCFA)').fill('500');
    await page.getByLabel('Stock initial').fill('1');
    await page.getByRole('button', { name: 'Enregistrer le produit' }).click();
    await page.getByRole('button', { name: 'Terminé' }).click();

    await page.goto('/app/pos');
    const card = page.locator('.merchant-card', { hasText: 'Sucre' }).first();
    await card.getByRole('button', { name: /Standard/ }).click();
    await page.getByRole('button', { name: 'Encaisser' }).click();
    await expect(page.locator('.alert-success')).toBeVisible();

    // Le stock est désormais à 0 : le bouton de vente passe en rupture.
    await expect(page.locator('.merchant-card', { hasText: 'Sucre' }).first()).toContainText('rupture');
  });

  test('restaure le panier et les choix de paiement après rechargement', async ({ page }) => {
    const unique = Date.now();
    await register(page, unique);

    await page.goto('/app/products');
    await page.getByRole('button', { name: '+ Ajouter un produit' }).first().click();
    await page.getByLabel('Nom du produit').fill('Panier persistant');
    await page.getByLabel('Prix de vente (FCFA)').fill('750');
    await page.getByLabel('Stock initial').fill('3');
    await page.getByRole('button', { name: 'Enregistrer le produit' }).click();
    await page.getByRole('button', { name: 'Terminé' }).click();

    await page.goto('/app/pos');
    const product = page.locator('.merchant-card', { hasText: 'Panier persistant' }).first();
    await product.getByRole('button', { name: /Standard/ }).click();
    await page.getByLabel('Moyen de paiement').selectOption('CREDIT');
    await page.getByLabel('Montant encaissé maintenant').fill('200');
    await expect(page.getByRole('heading', { name: 'Panier (1)' })).toBeVisible();

    // Attendre la transaction IndexedDB du brouillon, pas seulement le rendu React.
    await page.waitForFunction(() => new Promise<boolean>((resolve) => {
      const request = indexedDB.open('gawjaay-pos-drafts', 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('cartDrafts', 'readonly');
        const read = tx.objectStore('cartDrafts').getAll();
        read.onsuccess = () => {
          const saved = read.result.some((draft: { cart?: Record<string, { quantity?: number }> }) =>
            Object.values(draft.cart ?? {}).some((line) => line.quantity === 1),
          );
          db.close();
          resolve(saved);
        };
        read.onerror = () => { db.close(); resolve(false); };
      };
      request.onerror = () => resolve(false);
    }));

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Panier (1)' })).toBeVisible();
    await expect(page.getByText('Panier persistant — Standard')).toBeVisible();
    await expect(page.getByLabel('Moyen de paiement')).toHaveValue('CREDIT');
    await expect(page.getByLabel('Montant encaissé maintenant')).toHaveValue('200');
  });


  test('ignore les brouillons appartenant à un autre compte ou une autre boutique', async ({ page }) => {
    const unique = Date.now();
    await register(page, unique);

    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('gawjaay-pos-drafts', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('cartDrafts')) {
          db.createObjectStore('cartDrafts', { keyPath: 'id' });
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('cartDrafts', 'readwrite');
        tx.objectStore('cartDrafts').put({
          id: 'other-user:other-organization:other-store',
          userId: 'other-user',
          organizationId: 'other-organization',
          storeId: 'other-store',
          cart: {
            foreign: {
              productId: 'foreign-product',
              variantId: 'foreign-variant',
              name: 'Brouillon étranger — Standard',
              price: 999999,
              quantity: 1,
              packaging: 'UNIT',
              hasImage: false,
              imageUrl: null,
            },
          },
          customerId: '',
          payMethod: 'CASH',
          paidAmount: '',
          updatedAt: Date.now(),
        });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    }));

    await page.goto('/app/pos');
    await expect(page.getByRole('heading', { name: 'Panier (0)' })).toBeVisible();
    await expect(page.getByText('Brouillon étranger — Standard')).toHaveCount(0);
  });

});
