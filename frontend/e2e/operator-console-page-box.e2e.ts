import { expect, test, type Page } from '@playwright/test';

import { mockOwnedVenues } from './support/auth-mocks';
import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';

/**
 * The console's one page box (#1589): the stats strip spans the header's box, and every tab, the
 * pending-approval banner, the venue switch's popover and the tab load-error cards start at its
 * content edge (the wordmark's left), so switching tabs never moves it; the beach map alone stays
 * wider. Rendered geometry, so jsdom can't pin it.
 */

const PENDING = { username: 'operator', principalType: 'OPERATOR', operatorStatus: 'PENDING' };
const BOX = 1120;
const GUTTER = 24;

async function mockPendingConsole(page: Page): Promise<void> {
  await mockWholeConsole(page);
  let sessionLive = false;
  // Registered after the whole-console mock, so these answer first: a PENDING operator.
  await page.route(/\/api\/auth\/me$/, (route) =>
    sessionLive
      ? route.fulfill({ json: PENDING })
      : route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
  );
  await page.route(/\/api\/auth\/operator\/login$/, (route) => {
    sessionLive = true;
    return route.fulfill({ json: PENDING });
  });
}

async function left(page: Page, testId: string): Promise<number> {
  return (await page.getByTestId(testId).boundingBox())!.x;
}

// 900: the clamp (beach-map frame = box there); 1200: the 1120–1300px band; 1440/1700: wide.
test('at every desktop width the tabs, the strip and the banner share the header box', async ({
  page,
}) => {
  await mockPendingConsole(page);
  await page.goto('/operator/1/requests');
  await signInAsOperator(page);
  await expect(page.getByTestId('requests-tab')).toBeVisible();

  for (const width of [900, 1200, 1440, 1700]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId('oc-tabs').getByRole('link', { name: 'Requests' }).click();
    await expect(page.getByTestId('requests-tab')).toBeVisible();

    const box = Math.min(width, BOX);
    const boxEdge = (width - box) / 2;
    const contentEdge = boxEdge + GUTTER;
    expect(await left(page, 'oc-brand'), `${width}px`).toBe(contentEdge);

    const banner = (await page.getByTestId('pending-approval-banner').boundingBox())!;
    expect(banner.x).toBe(contentEdge);
    expect(banner.width).toBe(box - 2 * GUTTER);

    const strip = (await page.getByTestId('oc-stats').locator(':scope > div').boundingBox())!;
    expect(strip.x).toBe(boxEdge);
    expect(strip.width).toBe(box);

    const tabs = page.getByTestId('oc-tabs');
    for (const [tab, testId] of [
      ['Requests', 'requests-tab'],
      ['Pricing', 'pricing-tab'],
      ['Payouts', 'payouts-tab'],
      ['Venue & commodities', 'venue-tab'],
      ['Daily view', 'daily-view-tab'],
    ] as const) {
      await tabs.getByRole('link', { name: tab }).click();
      await expect(page.getByTestId(testId)).toBeVisible();
      expect(await left(page, testId), `${tab} at ${width}px`).toBe(contentEdge);
    }
    const daily = (await page.getByTestId('daily-view-tab').boundingBox())!;
    expect(daily.width).toBe(box - 2 * GUTTER);

    // The beach map keeps `.oc-main`'s wider fit-to-width frame: the viewport up to 1300px, less its gutters.
    await tabs.getByRole('link', { name: 'Beach map' }).click();
    const frame = Math.min(width, 1300);
    const editor = (await page.getByTestId('layout-editor').boundingBox())!;
    expect(editor.width).toBe(frame - 2 * GUTTER);
    expect(editor.x).toBe((width - frame) / 2 + GUTTER);
  }
});

// 900: the popover's max() clamps to the 1.5rem gutter; 1200/1440: the 50% term wins.
test('the venue switch popover opens on the wordmark edge at every desktop width', async ({
  page,
}) => {
  await mockWholeConsole(page);
  // Registered after the whole-console mock, so it answers first: two venues make the name a switch.
  await mockOwnedVenues(page, [
    { id: 1, name: 'Miramar Beach Club', beach: 'KSAMIL' },
    { id: 2, name: 'Sunset Lido', beach: 'DHERMI' },
  ]);
  // The popover's pop-in scales it; reduced motion drops the animation so its box is the resting one.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/operator/1/requests');
  await signInAsOperator(page);
  await expect(page.getByTestId('requests-tab')).toBeVisible();

  for (const width of [900, 1200, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByTestId('oc-venue-title').click();
    const menu = page.getByTestId('oc-venue-menu');
    await expect(menu).toBeVisible();

    const contentEdge = (width - Math.min(width, BOX)) / 2 + GUTTER;
    expect(await left(page, 'oc-brand'), `${width}px`).toBe(contentEdge);
    expect(await left(page, 'oc-venue-menu'), `${width}px`).toBe(contentEdge);

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  }
});

test('a tab load-error card starts at the content edge, not centred', async ({ page }) => {
  await mockWholeConsole(page);
  for (const read of [/\/beach-map$/, /\/booking-requests(\?.*)?$/, /\/payout-ledger$/]) {
    await page.route(read, (route) => route.fulfill({ status: 503, body: '' }));
  }
  await page.goto('/operator/1/daily');
  await signInAsOperator(page);
  await expect(page.getByTestId('daily-load-error')).toBeVisible();

  // 390: the tabs' 24 + 20px phone gutter (the rail is hidden there, so each tab loads by URL); 900: the clamp; 1440: wide.
  for (const width of [390, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const contentEdge = width < 640 ? GUTTER + 20 : (width - Math.min(width, BOX)) / 2 + GUTTER;
    for (const [tab, testId] of [
      ['daily', 'daily-load-error'],
      ['requests', 'requests-load-error'],
      ['payouts', 'payouts-load-error'],
    ] as const) {
      await page.goto(`/operator/1/${tab}`);
      await expect(page.getByTestId(testId)).toBeVisible();
      expect(await left(page, testId), `${tab} at ${width}px`).toBe(contentEdge);
    }
  }
});

test('on a phone the tabs keep their 24 + 20px gutter and nothing scrolls sideways', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPendingConsole(page);
  await page.goto('/operator/1/pricing');
  await signInAsOperator(page);
  await expect(page.getByTestId('pricing-tab')).toBeVisible();

  const pricing = (await page.getByTestId('pricing-tab').boundingBox())!;
  expect(pricing.x).toBe(GUTTER);
  await expect(page.getByTestId('pricing-tab')).toHaveCSS('padding-left', '20px');
  expect(await left(page, 'pending-approval-banner')).toBe(GUTTER);
  await expect(page.getByTestId('oc-stats').locator(':scope > div')).toHaveCSS(
    'padding-left',
    '20px',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
