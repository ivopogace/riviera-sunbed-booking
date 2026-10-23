import { expect, test, type Page } from '@playwright/test';

import { mockWholeConsole, signInAsOperator } from './support/operator-console.mocks';

/**
 * The console's one page box (#1589): every tab, the stats strip and the pending-approval banner
 * start at the header's content edge (the wordmark's left), so switching tabs never moves it; the
 * beach map alone stays wider. Rendered geometry, so jsdom can't pin it.
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

// 900 and 1200 take the clamp and the 1120–1300 band; 1440 and 1700 the wide case.
for (const width of [900, 1200, 1440, 1700]) {
  test(`at ${width}px every tab, the strip and the banner share the header's 1120px box`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockPendingConsole(page);
    await page.goto('/operator/1/requests');
    await signInAsOperator(page);
    await expect(page.getByTestId('requests-tab')).toBeVisible();

    const box = Math.min(width, BOX);
    const boxEdge = (width - box) / 2;
    const contentEdge = boxEdge + GUTTER;
    expect(await left(page, 'oc-brand')).toBe(contentEdge);

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
      expect(await left(page, testId), tab).toBe(contentEdge);
    }
    const daily = (await page.getByTestId('daily-view-tab').boundingBox())!;
    expect(daily.width).toBe(box - 2 * GUTTER);

    // The beach map keeps its wider fit-to-width frame: `.oc-main`'s 1300px less its gutters.
    await tabs.getByRole('link', { name: 'Beach map' }).click();
    const frame = Math.min(width, 1300);
    const editor = (await page.getByTestId('layout-editor').boundingBox())!;
    expect(editor.width).toBe(frame - 2 * GUTTER);
    expect(editor.x).toBe((width - frame) / 2 + GUTTER);
  });
}

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
