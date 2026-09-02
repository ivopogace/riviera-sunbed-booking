import { expect, Page } from '@playwright/test';

/**
 * Helpers for the shell's header overlays — the find-a-booking modal, the theme picker, the
 * mobile menu, and the signed-in account disclosure.
 *
 * <p>The shell closes every overlay on the router's `NavigationEnd`, and the header is interactive
 * before a lazily loaded route has finished activating (`page.goto` resolves on `load`, which the
 * route's chunk may outlive). An overlay opened in that window is closed again by the navigation
 * it raced, so each opener first waits for the routed page to be in the outlet.
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
