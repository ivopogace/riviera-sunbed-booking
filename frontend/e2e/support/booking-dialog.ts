import { Locator, Page, Route } from '@playwright/test';

import { ChallengeFence } from './auth-mocks';

/**
 * Settle running entrance animations (e.g. the booking dialog's pop) before an axe audit — a
 * mid-fade opacity reads as a false contrast failure (riviera-frontend rule). Awaits only FINITE
 * animations: the background gradient blobs run `infinite`, so awaiting their `.finished` would hang.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

/** Fill the Details step and advance through Review to submit (the v3 2-step booking dialog). */
export async function completeDialog(dialog: Locator, reviewCta: string): Promise<void> {
  await dialog.getByLabel('Full name').fill('Holiday Guest');
  await dialog.getByLabel('Email').fill('guest@example.com');
  await dialog.getByLabel('Phone').fill('+355699000');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click(); // Details → Review
  await dialog.getByRole('button', { name: reviewCta }).click();
}

/**
 * Route `POST /api/bookings` behind the mocked proof-of-work fence (ADR-0016): the fence screens
 * first, exactly as the edge filter runs ahead of the controller, so a refused create never reaches
 * `respond` — which is what proves the tourist's set was never claimed. Overrides any earlier route
 * on the same URL, so a spec can install its own outcome per test.
 */
export async function mockFencedBookingCreate(
  page: Page,
  fence: Pick<ChallengeFence, 'screen'>,
  respond: (route: Route) => ReturnType<Route['fulfill']>,
): Promise<void> {
  await page.route('**/api/bookings', (route) => {
    const refusal = fence.screen(route);
    return refusal ? route.fulfill(refusal) : respond(route);
  });
}
