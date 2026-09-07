import { expect, Locator, Page } from '@playwright/test';

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

/** Clicks a shell overlay trigger (`theme-toggle`, `menu-toggle`, `nav-user`, …) once the route has settled. */
export async function openShellOverlay(page: Page, testId: string): Promise<void> {
  await awaitRoutedPage(page);
  await page.getByTestId(testId).click();
}

/** Opens the signed-in account disclosure and proves it stayed open. */
export async function openAccountMenu(page: Page): Promise<void> {
  await openShellOverlay(page, 'nav-user');
  await expect(page.getByTestId('nav-user')).toHaveAttribute('aria-expanded', 'true');
}

/** The desktop popover's trigger: the account chip signed in, the round menu button signed out. */
export function headerMenuTrigger(page: Page): Locator {
  return page.locator('[data-testid="nav-user"], [data-testid="nav-menu"]');
}

/** Opens the desktop header popover (either auth state) and proves it stayed open. */
export async function openHeaderMenu(page: Page): Promise<Locator> {
  await awaitRoutedPage(page);
  const trigger = headerMenuTrigger(page);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  return trigger;
}

/** Opens the find-a-booking modal the way a desktop tourist does: through the header popover. */
export async function openFindBooking(page: Page): Promise<Locator> {
  const trigger = await openHeaderMenu(page);
  await page.getByTestId('find-open').click();
  return trigger;
}
