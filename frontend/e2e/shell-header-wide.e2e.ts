import { expect, test, type Page } from '@playwright/test';

import { awaitRoutedPage } from './support/shell';
import { mockTourist } from './support/tourist.mocks';

/**
 * The shell header's rendered geometry. `data.wide` lifts the inner wrapper's 1080px cap through
 * Tailwind's bare boolean `data-wide:` variant, and neither the compiled stylesheet nor a
 * laid-out box exists under jsdom — `app.spec.ts` pins the attribute, this pins what it buys.
 *
 * <p>On a wide route the wrapper spans the window and the brand sits in the header's own gutter
 * (x 24); capped, it runs 180 → 1260 at 1440 with the brand at x 204. The assertions state those
 * as relationships rather than transcribing the numbers, so unrelated padding work cannot fail
 * them. The eyebrow is route-independent, so it is pinned on a wide route and a capped one.
 */

/** The header's inner wrapper — the element carrying both the cap and the `data-wide` opt-in. */
const WRAPPER = 'header.riv-header > div';

const DESKTOP_WIDTHS = [1440, 1920] as const;

/** Discover with a fake map engine: this spec measures chrome, never the ground under it. */
async function openDiscover(page: Page, width: number): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __RIVIERA_FAKE_MAP__?: boolean }).__RIVIERA_FAKE_MAP__ = true;
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/');
  await awaitRoutedPage(page);
}

test.describe('the shell header on a wide route', () => {
  test.beforeEach(async ({ page }) => {
    await mockTourist(page);
  });

  for (const width of DESKTOP_WIDTHS) {
    test(`the header is the page's on Discover at ${width}`, async ({ page }) => {
      await openDiscover(page, width);

      const wrapper = page.locator(WRAPPER);
      await expect(wrapper).toHaveAttribute('data-wide', '');
      await expect(wrapper).toHaveCSS('max-width', 'none');

      // The wrapper spans the window: no centred column, so nothing to be 180/420px inside of.
      const box = (await wrapper.boundingBox())!;
      expect(Math.round(box.x)).toBe(0);
      expect(Math.round(box.width)).toBe(width);

      // The brand lands in the header's own gutter (sm:px-6 = 24), inside the panel's left edge.
      const brand = (await page.getByTestId('brand-home').boundingBox())!;
      expect(Math.round(brand.x)).toBeLessThanOrEqual(40);

      // The account controls reach the other edge rather than stopping ~200px short of it.
      const controls = (await page.getByTestId('nav-menu').boundingBox())!;
      expect(controls.x + controls.width).toBeGreaterThan(width - 60);
    });
  }

  test('the eyebrow is 12.5px in its own case on every route', async ({ page }) => {
    // Route-independent, unlike the width: the brand block is one thing on every page.
    for (const path of ['/', '/my-bookings']) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await awaitRoutedPage(page);

      const eyebrow = page.locator('.riv-eyebrow');
      await expect(eyebrow).toHaveText('Albanian Coast');
      await expect(eyebrow).toHaveCSS('font-size', '12.5px');
      // A tracked-out all-caps eyebrow is the templated tell; this is `tracking-wide`, own case.
      await expect(eyebrow).toHaveCSS('text-transform', 'none');
      await expect(eyebrow).toHaveCSS('letter-spacing', '0.3125px');
    }
  });

  test('every other route keeps the 1080px cap, header and footer alike', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/my-bookings');
    await awaitRoutedPage(page);

    const wrapper = page.locator(WRAPPER);
    await expect(wrapper).not.toHaveAttribute('data-wide', '');
    await expect(wrapper).toHaveCSS('max-width', '1080px');

    const box = (await wrapper.boundingBox())!;
    expect(Math.round(box.width)).toBe(1080);
    // The brand sits the cap's margin inside the window, as it always has.
    const brand = (await page.getByTestId('brand-home').boundingBox())!;
    expect(Math.round(brand.x)).toBeGreaterThan(150);
  });

  test("a capped route's footer keeps its 1080px cap", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/my-bookings');
    await awaitRoutedPage(page);

    // Same utility on the same element as the header wrapper, so the wide leg rides those cases.
    const inner = page.locator('.riv-footer-inner');
    await expect(inner).not.toHaveAttribute('data-wide', '');
    await expect(inner).toHaveCSS('max-width', '1080px');
  });
});
