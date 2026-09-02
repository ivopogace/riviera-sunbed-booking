import { expect, Page } from '@playwright/test';

/**
 * Helpers for the shell's header overlays — the find-a-booking modal, the theme picker, the
 * mobile menu, and the signed-in account disclosure.
 *
 * <p>Each opener first waits for the routed page to be in the outlet: `page.goto` resolves on
 * `load`, which a lazily loaded route's chunk may outlive, so without the wait a trigger is clicked
 * on a header floating over an empty outlet. The shell no longer closes an overlay when the
 * navigation it was opened during completes (#892), but a first load redirected by a guard resumes
 * under a fresh navigation id and does still close one — so the wait is what makes an opener
 * deterministic, not a workaround for a bug. A redirect the spec itself sets off, such as the one
 * after sign-in, is the spec's own to await: this helper only waits for SOME routed page.
 */

/** Resolves once the current route's component is rendered in the shell's outlet. */
export async function awaitRoutedPage(page: Page): Promise<void> {
  await expect(page.locator('main > router-outlet + *')).toBeAttached();
}

/** Clicks a shell overlay trigger (`find-open`, `theme-toggle`, `menu-toggle`, …) once the route has settled. */
export async function openShellOverlay(page: Page, testId: string): Promise<void> {
  await awaitRoutedPage(page);
  await page.getByTestId(testId).click();
}

/** Opens the signed-in account disclosure and proves it stayed open. */
export async function openAccountMenu(page: Page): Promise<void> {
  await openShellOverlay(page, 'nav-user');
  await expect(page.getByTestId('nav-user')).toHaveAttribute('aria-expanded', 'true');
}
