import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Parcours acheteur M4, de bout en bout, contre l'API réelle :
 * Découverte → Fiche produit → Panier → Checkout → Commande → Suivi.
 * Exécuté sur desktop ET mobile (projets Playwright).
 *
 * Le vendeur et son catalogue sont préparés via l'API ; le PARCOURS ACHETEUR
 * (login, panier, commande, suivi, annulation) est exercé via l'interface.
 */

const API = 'http://localhost:4000/api/v1';
const WEB = 'http://localhost:4173';

interface SellerFixture {
  token: string;
  organizationId: string;
  storeId: string;
  productId: string;
  variantId: string;
  productName: string;
}

async function setupSeller(api: APIRequestContext, unique: number): Promise<SellerFixture> {
  const email = `m4.seller.${unique}@gawjaay.test`;
  const reg = await api.post(`${API}/auth/register`, {
    data: {
      email,
      password: 'Password123!',
      fullName: 'Vendeur M4',
      organizationName: `Org M4 ${unique}`,
      storeName: `Boutique M4 ${unique}`,
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

  const productName = `Riz local ${unique}`;
  const prod = await api.post(`${API}/products`, {
    headers,
    data: {
      name: productName,
      purchasePrice: 1000,
      price: 3000,
      marketplaceVisible: true,
      variants: [{ name: 'Sac 5 kg' }],
    },
  });
  expect(prod.ok()).toBeTruthy();
  const product = await prod.json();
  const productId = product.product.id as string;
  const variantId = product.product.variants[0].id as string;

  const stock = await api.post(`${API}/inventory/adjust`, {
    headers,
    data: { storeId, variantId, quantity: 10, type: 'INITIAL' },
  });
  expect(stock.ok()).toBeTruthy();

  const publish = await api.patch(`${API}/stores/${storeId}`, {
    headers,
    data: { isPublic: true, latitude: 14.6928, longitude: -17.4467 },
  });
  expect(publish.ok()).toBeTruthy();

  return { token, organizationId, storeId, productId, variantId, productName };
}

async function loginAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill('Password123!');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/app$/);
}

test.describe('marketplace M4 — parcours acheteur', () => {
  test('Découvrir → Produit → Panier → Checkout → Commande → Suivi', async ({ browser, baseURL }) => {
    test.slow();
    const unique = Date.now();

    /* ── Préparation vendeur (API) ── */
    const sellerCtx = await browser.newContext();
    const fixture = await setupSeller(sellerCtx.request, unique);
    await sellerCtx.close();

    /* ── Compte acheteur (API) ── */
    const buyerEmail = `m4.buyer.${unique}@gawjaay.test`;
    const buyerCtx = await browser.newContext({ baseURL: baseURL ?? WEB });
    const reg = await buyerCtx.request.post(`${API}/auth/register`, {
      data: {
        email: buyerEmail,
        password: 'Password123!',
        fullName: 'Acheteur M4',
        organizationName: `Org Acheteur ${unique}`,
        storeName: `Store Acheteur ${unique}`,
        region: 'Dakar',
        city: 'Dakar',
      },
    });
    expect(reg.ok()).toBeTruthy();

    const page = await buyerCtx.newPage();

    /* ── Connexion (UI) ── */
    await loginAs(page, buyerEmail);

    /* ── Fiche produit ── */
    await page.goto(`/product/${fixture.productId}`);
    await expect(page.getByRole('heading', { name: fixture.productName })).toBeVisible();
    await expect(page.getByText('Boutique M4').first()).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter au panier' }).click();
    await expect(page.getByText('Article ajouté au panier.')).toBeVisible();

    /* ── Panier ── */
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'Mon panier' })).toBeVisible();
    await expect(page.getByText(fixture.productName)).toBeVisible();

    /* ── Checkout ── */
    await page.getByRole('button', { name: 'Commander' }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await page.getByLabel('Nom').fill('Acheteur Test');
    await page.getByLabel('Téléphone').fill('+221770000000');
    await page.getByRole('button', { name: 'Confirmer la commande' }).click();

    /* ── Commande créée → suivi ── */
    await expect(page).toHaveURL(/\/orders\/[a-z0-9]+/i);
    await expect(page.getByText('En attente').first()).toBeVisible();
    await expect(page.getByText(/GJ-\d{8}-[A-Z0-9]{6}/).first()).toBeVisible();
    // Paiement honnête : la commande n'est pas présentée comme payée.
    await expect(page.getByText(/Paiement en ligne indisponible/i)).toBeVisible();

    /* ── Liste des commandes ── */
    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'Mes commandes' })).toBeVisible();
    await expect(page.getByText(/GJ-\d{8}-[A-Z0-9]{6}/).first()).toBeVisible();

    /* ── Annulation (statut ouvrable) ── */
    await page.getByText(/GJ-\d{8}-[A-Z0-9]{6}/).first().click();
    await page.getByRole('button', { name: 'Annuler la commande' }).click();
    await expect(page.getByText('Annulée').first()).toBeVisible();

    await buyerCtx.close();
  });

  test('un produit inconnu affiche un état honnête, jamais une page blanche', async ({ page }) => {
    await page.goto('/product/inexistant-' + Date.now());
    await expect(page.getByText('Produit introuvable')).toBeVisible();
  });

  test('le panier est conservé après rechargement (persistance locale)', async ({ browser, baseURL }) => {
    const unique = Date.now();
    const sellerCtx = await browser.newContext();
    const fixture = await setupSeller(sellerCtx.request, unique);
    await sellerCtx.close();

    const ctx = await browser.newContext({ baseURL: baseURL ?? WEB });
    const page = await ctx.newPage();

    await page.goto(`/product/${fixture.productId}`);
    await page.getByRole('button', { name: 'Ajouter au panier' }).click();
    await expect(page.getByText('Article ajouté au panier.')).toBeVisible();

    await page.reload();
    await page.goto('/cart');
    await expect(page.getByText(fixture.productName)).toBeVisible();
    await ctx.close();
  });
});
