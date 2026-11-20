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

/** Fill the Details step and advance to Review, the step that hosts the widget and submits. */
export async function fillDetailsAndContinue(dialog: Locator): Promise<void> {
  await dialog.getByLabel('Full name').fill('Holiday Guest');
  await dialog.getByLabel('Email').fill('guest@example.com');
  await dialog.getByLabel('Phone').fill('+355699000');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
}

/** Fill the Details step and advance through Review to submit (the 2-step booking dialog). */
export async function completeDialog(dialog: Locator, reviewCta: string): Promise<void> {
  await fillDetailsAndContinue(dialog);
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

/** Refuse every booking create as the server does a set another tourist just took (invariant #2). */
export async function refuseBookingAsTaken(
  page: Page,
  fence: Pick<ChallengeFence, 'screen'>,
): Promise<void> {
  await refuseBooking(page, fence, {
    status: 409,
    title: 'Conflict',
    detail: 'The set is already taken for this date.',
    code: 'SET_TAKEN',
  });
}

/** Refuse the fenced create with the server's problem body for `code` (`Rejections.java`: 422 but for `SET_TAKEN` and `NO_SUCH_SET`). */
export async function refuseBooking(
  page: Page,
  fence: Pick<ChallengeFence, 'screen'>,
  problem: { status: number; title: string; detail: string; code: string },
): Promise<void> {
  // The RFC-7807 contract: application/problem+json whose stable identity is the `code` extension.
  await mockFencedBookingCreate(page, fence, (route) =>
    route.fulfill({
      status: problem.status,
      contentType: 'application/problem+json',
      json: { type: 'about:blank', ...problem },
    }),
  );
}
