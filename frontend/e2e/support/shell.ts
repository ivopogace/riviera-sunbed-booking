import { expect, Page } from '@playwright/test';

/**
 * Helpers for the shell's header overlays — the find-a-booking modal, the theme picker, the
 * mobile menu, and the signed-in account disclosure.
 *
 * <p>Each opener first waits for the routed page to be in the outlet, because a spec that clicks a
 * header trigger is asserting about the page under it: `page.goto` resolves on `load`, which a
 * lazily loaded route's chunk may outlive. The shell no longer closes overlays on the initial
 * navigation (#892), so this is the spec's own precondition rather than a workaround; it also
 * covers the redirects that stay in scope of the close rule, such as the post-sign-in one.
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
