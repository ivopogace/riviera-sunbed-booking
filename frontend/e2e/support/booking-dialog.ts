import { Locator, Page } from '@playwright/test';

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
