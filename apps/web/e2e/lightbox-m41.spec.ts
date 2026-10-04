import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import * as zlib from 'node:zlib';

/**
 * M4.1 — dimensionnement réel de l'aperçu image (lightbox).
 *
 * Ces tests mesurent des rectangles RÉELLEMENT rendus (`getBoundingClientRect`)
 * contre le viewport et l'enveloppe visuelle, sur desktop ET mobile, en
 * utilisant une image haute résolution : c'est la seule situation qui exerce
 * réellement la borne (une petite image n'est jamais agrandie).
 */

const API = 'http://localhost:4000/api/v1';

function uniq(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/* ── Génération d'un vrai PNG (Node zlib), sans dépendance externe ── */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tag = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])), 0);
  return Buffer.concat([len, tag, data, crc]);
}

/** PNG RGB avec un dégradé doux : réel, haute résolution, mais compressible. */
function pngDataUrl(width: number, height: number): string {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // couleur RGB
  const rowLen = 1 + width * 3;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const o0 = y * rowLen;
    raw[o0] = 0; // filtre
    for (let x = 0; x < width; x++) {
      const o = o0 + 1 + x * 3;
      // Blocs grossiers → haute résolution ET forte compressibilité.
      const block = (((x >> 7) + (y >> 7)) & 1) === 0 ? 210 : 40;
      raw[o] = block;
      raw[o + 1] = (y * 255 / height) | 0;
      raw[o + 2] = (x * 255 / width) | 0;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const png = Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

interface Fixture {
  productId: string;
  productName: string;
}

async function setupProduct(
  api: APIRequestContext,
  unique: string,
  image: string,
  stock: number,
): Promise<Fixture> {
  const reg = await api.post(`${API}/auth/register`, {
    data: {
      email: `lb.merchant.${unique}@gawjaay.test`,
      password: 'Password123!',
      fullName: 'Marchand Lightbox',
      organizationName: `Org LB ${unique}`,
      storeName: `Boutique LB ${unique}`,
      region: 'Dakar',
      city: 'Dakar',
    },
  });
  expect(reg.ok()).toBeTruthy();
  const body = await reg.json();
  const headers = {
    Authorization: `Bearer ${body.accessToken as string}`,
    'x-organization-id': body.organization.id as string,
  };
  const storeId = body.store.id as string;

  const cat = await api.post(`${API}/categories`, {
    headers,
    data: { name: `Cat LB ${unique}` },
  });
  expect(cat.ok()).toBeTruthy();
  const categoryId = (await cat.json()).category.id as string;

  const productName = `Article LB ${unique}`;
  const prod = await api.post(`${API}/products`, {
    headers,
    data: {
      name: productName,
      purchasePrice: 500,
      price: 2500,
      categoryId,
      marketplaceVisible: true,
      imageData: image,
      variants: [{ name: 'Standard' }],
    },
  });
  expect(prod.ok()).toBeTruthy();
  const product = (await prod.json()).product;

  if (stock > 0) {
    const s = await api.post(`${API}/inventory/adjust`, {
      headers,
      data: { storeId, variantId: product.variants[0].id, quantity: stock, type: 'INITIAL' },
    });
    expect(s.ok()).toBeTruthy();
  }
  const publish = await api.patch(`${API}/stores/${storeId}`, {
    headers,
    data: { isPublic: true, latitude: 14.6928, longitude: -17.4467 },
  });
  expect(publish.ok()).toBeTruthy();

  return { productId: product.id as string, productName };
}

/** Mesure le rectangle réel de l'image ET de l'enveloppe (lightbox + stage). */
async function measure(page: Page) {
  return page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>('.lightbox-stage img')!;
    const stage = document.querySelector<HTMLElement>('.lightbox-stage')!;
    const overlay = document.querySelector<HTMLElement>('.lightbox')!;
    const ir = img.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    const or = overlay.getBoundingClientRect();
    const cs = getComputedStyle(overlay);
    return {
      img: { x: ir.x, y: ir.y, width: ir.width, height: ir.height },
      stage: { x: sr.x, y: sr.y, width: sr.width, height: sr.height },
      overlay: { x: or.x, y: or.y, width: or.width, height: or.height },
      padding: {
        top: parseFloat(cs.paddingTop),
        right: parseFloat(cs.paddingRight),
        bottom: parseFloat(cs.paddingBottom),
        left: parseFloat(cs.paddingLeft),
      },
      natural: { width: img.naturalWidth, height: img.naturalHeight },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
}

async function openLightbox(page: Page, productName: string) {
  await page.getByRole('button', { name: `Agrandir la photo de ${productName}` }).click();
  await expect(page.getByRole('dialog', { name: productName })).toBeVisible();
  // Attend que l'image soit réellement décodée (mesure fiable).
  await expect
    .poll(async () =>
      page.locator('.lightbox-stage img').evaluate((el) => (el as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
}

/** Invariant central : l'image ne dépasse ni l'enveloppe interne ni le viewport. */
function assertBounded(m: Awaited<ReturnType<typeof measure>>) {
  const tol = 1; // arrondi sous-pixel
  // 1. Jamais plus grande que l'enveloppe du stage.
  expect(m.img.width).toBeLessThanOrEqual(m.stage.width + tol);
  expect(m.img.height).toBeLessThanOrEqual(m.stage.height + tol);
  // 2. Le stage lui-même tient dans la zone visible de l'overlay.
  expect(m.stage.x).toBeGreaterThanOrEqual(m.overlay.x + m.padding.left - tol);
  expect(m.stage.y).toBeGreaterThanOrEqual(m.overlay.y + m.padding.top - tol);
  expect(m.stage.x + m.stage.width).toBeLessThanOrEqual(
    m.overlay.x + m.overlay.width - m.padding.right + tol,
  );
  expect(m.stage.y + m.stage.height).toBeLessThanOrEqual(
    m.overlay.y + m.overlay.height - m.padding.bottom + tol,
  );
  // 3. L'image ne touche jamais les bords du viewport (enveloppe visuelle).
  expect(m.img.x).toBeGreaterThanOrEqual(0);
  expect(m.img.y).toBeGreaterThanOrEqual(0);
  expect(m.img.x + m.img.width).toBeLessThanOrEqual(m.viewport.width + tol);
  expect(m.img.y + m.img.height).toBeLessThanOrEqual(m.viewport.height + tol);
}

/** Proportions conservées (contain) : ratio rendu == ratio naturel. */
function assertContain(m: Awaited<ReturnType<typeof measure>>) {
  const naturalRatio = m.natural.width / m.natural.height;
  const renderedRatio = m.img.width / m.img.height;
  expect(Math.abs(naturalRatio - renderedRatio)).toBeLessThan(0.02);
}

test.describe('M4.1 — aperçu image haute résolution borné (desktop + mobile)', () => {
  test('paysage haute résolution : contain, borné, sans débordement', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL });
    const unique = uniq();
    const fixture = await setupProduct(ctx.request, unique, pngDataUrl(1600, 1000), 5);
    const page = await ctx.newPage();
    await page.goto(`/product/${fixture.productId}`);
    await openLightbox(page, fixture.productName);

    const m = await measure(page);
    // L'image naturelle dépasse le viewport : la borne est donc réellement testée.
    expect(m.natural.width).toBeGreaterThan(m.viewport.width);
    assertBounded(m);
    assertContain(m);

    await page.getByRole('button', { name: 'Fermer l’aperçu' }).click();
    await expect(page.getByRole('dialog', { name: fixture.productName })).toBeHidden();
    await ctx.close();
  });

  test('portrait haute résolution : contain, borné, fermable au fond', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL });
    const unique = uniq();
    const fixture = await setupProduct(ctx.request, unique, pngDataUrl(1000, 1800), 5);
    const page = await ctx.newPage();
    await page.goto(`/product/${fixture.productId}`);
    await openLightbox(page, fixture.productName);

    const m = await measure(page);
    expect(m.natural.height).toBeGreaterThan(m.viewport.height);
    assertBounded(m);
    assertContain(m);

    const vp = page.viewportSize()!;
    await page.mouse.click(4, vp.height - 4);
    await expect(page.getByRole('dialog', { name: fixture.productName })).toBeHidden();
    await ctx.close();
  });

  test('petite image : jamais agrandie au-delà de sa taille réelle', async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL });
    const unique = uniq();
    const fixture = await setupProduct(ctx.request, unique, pngDataUrl(240, 160), 5);
    const page = await ctx.newPage();
    await page.goto(`/product/${fixture.productId}`);
    await openLightbox(page, fixture.productName);

    const m = await measure(page);
    expect(m.img.width).toBeLessThanOrEqual(m.natural.width + 1);
    expect(m.img.height).toBeLessThanOrEqual(m.natural.height + 1);
    assertBounded(m);
    await ctx.close();
  });
});
