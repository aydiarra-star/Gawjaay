import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Correctifs UI/UX M4 :
 *   1. Image produit — lightbox maîtrisée (contain, bornée, fermable).
 *   2. Barre de catégories — filtrante, réelle, scrollable.
 *   3. CTA achat/commande — libellés acheteur, état Indisponible.
 *
 * Les données (catégorie, produit, stock) sont créées via l'API réelle puis
 * exercées dans l'interface, sur desktop ET mobile.
 */

const API = 'http://localhost:4000/api/v1';

/** Jeton unique anti-collision (les projets desktop/mobile tournent en parallèle). */
function uniq(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// Images réelles en data-URI (portrait et paysage) — aucune image inventée.
const LANDSCAPE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAACgCAIAAAC9uXYyAAABRElEQVR42u3SQQ0AAAgDscmZfxXIQgUf0qQKLpdp4Y1IgKHB0GBoMDSGBkODocHQYGgMDYYGQ4OhwdAYGgwNhgZDg6ExNBgaDA2GBkNjaDA0GBoMDYbG0GBoMDQYGgyNocHQYGgwNIYGQ4OhwdBgaAwNhgZDg6HB0BgaDA2GBkODoTE0GBoMDYYGQ2NoMDQYGgwNhsbQYGgwNBgaDI2hwdBgaDA0GBpDg6HB0GBoDA2GBkODocHQGBoMDYYGQ4OhMTQYGgwNhgZDY2gwNBgaDA2GxtBgaDA0GBoMjaHB0GBoMDQYGkODocHQYGgMrQKGBkODocHQGBoMDYYGQ4OhMTQYGgwNhgZDY2gwNBgaDA2GxtBgaDA0GBoMjaHB0GBoMDQYGkODocHQYGgwNIYGQ4OhwdAYGgwNhgZDg6ExNBgaDA03FvcWGZ0RJc5lAAAAAElFTkSuQmCC';
const PORTRAIT =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAADwCAIAAAAII/iNAAABfUlEQVR42u3RAQkAAAgEsY9jRCMayxoig0twS/XocbEAsAALsAALsAALMGABFmABFmABFmDAAizAAizAAizAAgxYgAVYgAVYgAUYsAALsAALsAALMGABFmABFmABFmABBizAAizAAizAAgxYgAVYgAVYgAUYsAuABViABViABViAAQuwAAuwAAuwAAMWYAEWYAEWYAEWYMACLMACLMACLMCABViABViABViAAQuwAAuwAAuwAAswYAEWYAEWYAEWYMACLMACLMACLMCAXQAswAIswAIswAIMWIAFWIAFWIAFGLAAC7AAC7AAC7AAAxZgARZgARZgAQYswAIswAIswAIMWIAFWIAFWIAFWIABC7AAC7AAC7AAAxZgARZgARZgAQYswAIswAIswAIswIAFWIAFWIAFWIABC7AAC7AAC7AACzBgARZgARZgARZgwAIswAIswAIswIAFWIAFWIAFWIAFGLAAC7AAC7AACzBgARZgARZgARZgwAIswLrYAtYJ/E+8UVQDAAAAAElFTkSuQmCC';

interface CatalogFixture {
  productId: string;
  variantId: string;
  productName: string;
  categoryName: string;
  storeId: string;
  token: string;
  organizationId: string;
}

/** Crée une catégorie + un produit en stock, publié marketplace, avec photo. */
async function setupCatalog(
  api: APIRequestContext,
  unique: string,
  opts: { image: string; stock: number; categoryName: string },
): Promise<CatalogFixture> {
  const reg = await api.post(`${API}/auth/register`, {
    data: {
      email: `ux.merchant.${unique}@gawjaay.test`,
      password: 'Password123!',
      fullName: 'Marchand UX',
      organizationName: `Org UX ${unique}`,
      storeName: `Boutique UX ${unique}`,
      region: 'Dakar',
      city: 'Dakar',
    },
  });
  expect(reg.ok()).toBeTruthy();
  const body = await reg.json();
  const token = body.accessToken as string;
  const organizationId = body.organization.id as string;
  const storeId = body.store.id as string;
  const headers = { Authorization: `Bearer ${token}`, 'x-organization-id': organizationId };

  const cat = await api.post(`${API}/categories`, {
    headers,
    data: { name: opts.categoryName },
  });
  expect(cat.ok()).toBeTruthy();
  const categoryId = (await cat.json()).category.id as string;

  const productName = `Article UX ${unique}`;
  const prod = await api.post(`${API}/products`, {
    headers,
    data: {
      name: productName,
      purchasePrice: 500,
      price: 2500,
      categoryId,
      marketplaceVisible: true,
      imageData: opts.image,
      variants: [{ name: 'Standard' }],
    },
  });
  expect(prod.ok()).toBeTruthy();
  const product = (await prod.json()).product;
  const productId = product.id as string;
  const variantId = product.variants[0].id as string;

  if (opts.stock > 0) {
    const stock = await api.post(`${API}/inventory/adjust`, {
      headers,
      data: { storeId, variantId, quantity: opts.stock, type: 'INITIAL' },
    });
    expect(stock.ok()).toBeTruthy();
  }

  const publish = await api.patch(`${API}/stores/${storeId}`, {
    headers,
    data: { isPublic: true, latitude: 14.6928, longitude: -17.4467 },
  });
  expect(publish.ok()).toBeTruthy();

  return { productId, variantId, productName, categoryName: opts.categoryName, storeId, token, organizationId };
}

/** La lightbox et son image restent entièrement dans le viewport (aucun débordement). */
async function expectWithinViewport(page: import('@playwright/test').Page) {
  const vp = page.viewportSize()!;
  const box = await page.locator('.lightbox-stage img').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
}

/** L'image est réellement décodée (pas une icône cassée), quel que soit le viewport. */
async function expectImageDecoded(page: import('@playwright/test').Page) {
  await expect
    .poll(async () =>
      page.locator('.lightbox-stage img').evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
}

test.describe('M4 — image produit maîtrisée (lightbox)', () => {
  for (const { label, image } of [
    { label: 'paysage', image: LANDSCAPE },
    { label: 'portrait', image: PORTRAIT },
  ]) {
    test(`image ${label} : contain, bornée au viewport, fermable`, async ({ browser, baseURL }) => {
      const unique = uniq();
      const ctx = await browser.newContext({ baseURL });
      const fixture = await setupCatalog(ctx.request, unique, { image, stock: 5, categoryName: `Photo ${label} ${unique}` });
      const page = await ctx.newPage();

      await page.goto(`/product/${fixture.productId}`);
      await expect(page.getByRole('heading', { name: fixture.productName })).toBeVisible();

      // Ouvrir la vue détaillée via le bouton d'agrandissement.
      await page.getByRole('button', { name: `Agrandir la photo de ${fixture.productName}` }).click();
      const lightbox = page.getByRole('dialog', { name: fixture.productName });
      await expect(lightbox).toBeVisible();
      await expect(lightbox.locator('img')).toBeVisible();

      // Jamais plus grand que nécessaire : l'image reste dans le viewport.
      await expectWithinViewport(page);
      // L'image est réellement servie (pas bloquée par un en-tête CORP).
      await expectImageDecoded(page);

      // Fermeture par le bouton dédié, toujours accessible.
      await page.getByRole('button', { name: "Fermer l’aperçu" }).click();
      await expect(lightbox).toBeHidden();
      await ctx.close();
    });
  }

  test('la lightbox se ferme au clic sur l’arrière-plan', async ({ browser, baseURL }) => {
    const unique = uniq();
    const ctx = await browser.newContext({ baseURL });
    const fixture = await setupCatalog(ctx.request, unique, { image: LANDSCAPE, stock: 3, categoryName: `Photo fond ${unique}` });
    const page = await ctx.newPage();

    await page.goto(`/product/${fixture.productId}`);
    await page.getByRole('button', { name: `Agrandir la photo de ${fixture.productName}` }).click();
    const lightbox = page.getByRole('dialog', { name: fixture.productName });
    await expect(lightbox).toBeVisible();

    // Clic hors de la zone image → fermeture.
    const vp = page.viewportSize()!;
    await page.mouse.click(4, vp.height - 4);
    await expect(lightbox).toBeHidden();
    await ctx.close();
  });
});

test.describe('M4 — barre de catégories', () => {
  test('filtre réellement et respecte la recherche combinée', async ({ browser, baseURL }) => {
    const unique = uniq();
    const ctx = await browser.newContext({ baseURL });
    const wanted = await setupCatalog(ctx.request, unique, { image: LANDSCAPE, stock: 4, categoryName: `Catégorie A ${unique}` });
    const other = await setupCatalog(ctx.request, uniq(), { image: LANDSCAPE, stock: 4, categoryName: `Catégorie B ${unique}` });
    const page = await ctx.newPage();

    await page.goto('/marketplace');
    const bar = page.getByRole('tablist', { name: 'Catégories' });
    await expect(bar).toBeVisible();

    // Catégorie de « wanted » → seul son produit apparaît.
    await bar.getByRole('tab', { name: wanted.categoryName }).click();
    await expect(page.getByText(wanted.productName)).toBeVisible();
    await expect(page.getByText(other.productName)).toHaveCount(0);

    // Combinaison recherche + catégorie B → le produit A disparaît.
    await page.getByRole('tablist', { name: 'Catégories' }).getByRole('tab', { name: other.categoryName }).click();
    await page.getByLabel('Rechercher').fill(wanted.productName);
    await page.getByRole('button', { name: 'Appliquer les filtres' }).click();
    await expect(page.getByText('Aucun produit disponible')).toBeVisible();

    // « Tous » = aucun filtre catégorie : le produit A revient.
    await page.getByRole('tablist', { name: 'Catégories' }).getByRole('tab', { name: 'Tous' }).click();
    await expect(page.getByText(wanted.productName)).toBeVisible();
    await ctx.close();
  });

  test('« Tous » reste la catégorie virtuelle active par défaut', async ({ page }) => {
    await page.goto('/marketplace');
    // Si des catégories existent, « Tous » est actif ; sinon la barre n'est pas rendue.
    const bar = page.getByRole('tablist', { name: 'Catégories' });
    if (await bar.count()) {
      await expect(bar.getByRole('tab', { name: 'Tous' })).toHaveAttribute('aria-selected', 'true');
    }
  });
});

test.describe('M4 — CTA achat / commande', () => {
  test('produit disponible : « Ajouter au panier » sur la grille et la fiche', async ({ browser, baseURL }) => {
    const unique = uniq();
    const ctx = await browser.newContext({ baseURL });
    const fixture = await setupCatalog(ctx.request, unique, { image: LANDSCAPE, stock: 2, categoryName: `CTA ${unique}` });
    const page = await ctx.newPage();

    // Fiche produit : action principale + WhatsApp seulement si réel.
    await page.goto(`/product/${fixture.productId}`);
    await expect(page.getByRole('button', { name: 'Ajouter au panier' })).toBeEnabled();

    // La grille marketplace affiche aussi l'action acheteur.
    await page.goto('/marketplace');
    const card = page.locator('.product-card', { hasText: fixture.productName }).first();
    await expect(card.getByRole('button', { name: 'Ajouter au panier' })).toBeVisible();
    await card.getByRole('button', { name: 'Ajouter au panier' }).click();
    await expect(page.getByText('Ajouté au panier.')).toBeVisible();
    // Le panier est accessible.
    await expect(page.getByRole('link', { name: /Panier/ })).toBeVisible();
    await ctx.close();
  });

  test('produit réellement indisponible : jamais de CTA d’achat, état honnête', async ({ browser, baseURL }) => {
    const unique = uniq();
    const ctx = await browser.newContext({ baseURL });
    // Stock 0 → le produit n'est pas découvrable : aucune offre achetable.
    const fixture = await setupCatalog(ctx.request, unique, { image: LANDSCAPE, stock: 0, categoryName: `Indispo ${unique}` });
    const page = await ctx.newPage();

    // La fiche refuse honnêtement tout achat : aucun bouton actif, aucun panier.
    await page.goto(`/product/${fixture.productId}`);
    await expect(page.getByText('Produit introuvable')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajouter au panier' })).toHaveCount(0);

    // Absent de la marketplace (filtre en-stock serveur).
    await page.goto('/marketplace');
    await expect(page.getByText(fixture.productName)).toHaveCount(0);
    await ctx.close();
  });

  test('aucun CTA « Vendre » pour un acheteur sur la marketplace', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page.getByRole('button', { name: 'Vendre', exact: true })).toHaveCount(0);
  });
});
