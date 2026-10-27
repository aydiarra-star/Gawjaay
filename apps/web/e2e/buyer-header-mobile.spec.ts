import { expect, test } from '@playwright/test';

const MOBILE_WIDTHS = [375, 390, 414, 430];

test.describe('en-tête acheteur — responsive mobile', () => {
  for (const width of MOBILE_WIDTHS) {
    test(`la navigation ne recouvre pas le titre à ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/marketplace');

      const header = page.locator('.topbar').first();
      await expect(header).toBeVisible();
      await expect(header.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();

      const heading = page.locator('main h1').first();
      await expect(heading).toBeVisible();

      const headerBox = await header.boundingBox();
      const headingBox = await heading.boundingBox();
      expect(headerBox, 'en-tête doit avoir une géométrie').not.toBeNull();
      expect(headingBox, 'titre principal doit avoir une géométrie').not.toBeNull();
      expect(headingBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 1);

      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(widths.content, 'aucun débordement horizontal de la page').toBeLessThanOrEqual(widths.viewport);
    });
  }
});
