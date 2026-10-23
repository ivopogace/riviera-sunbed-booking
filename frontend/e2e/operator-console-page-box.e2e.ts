import { expect, test, type Page } from '@playwright/test';

import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';

/**
 * The console's one page box (#1589): the stats strip spans the header's box, and every tab and
 * the pending-approval banner start at its content edge (the wordmark's left), so switching tabs
 * never moves it; the beach map alone stays wider. Rendered geometry, so jsdom can't pin it.
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
