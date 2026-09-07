import { expect, Locator, Page } from '@playwright/test';

/**
 * Helpers for the shell's overlays — the find-a-booking modal, the theme picker, the phone tab
 * bar's sheet, the signed-in account disclosure, and the console shell's account chip.
 *
 * <p>Each opener first waits for the routed page to be in the outlet: `page.goto` resolves on
 * `load`, which a lazily loaded route's chunk may outlive, so without the wait a trigger is clicked
 * on a header floating over an empty outlet. The shell keeps an overlay open across the navigation
 * it was opened during, but a first load redirected by a guard resumes under a fresh navigation id
 * and does close one — so the wait is what makes an opener deterministic, not a workaround for a
 * bug. A redirect the spec itself sets off, such as the one after sign-in, is the spec's own to
 * await: this helper only waits for SOME routed page.
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
  return page.getByTestId('nav-user').or(page.getByTestId('nav-menu'));
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

/**
 * Opens the console shell's account chip (`oc-*`, the one operator header) and proves it stayed
 * open — the rows (`oc-signout`, `oc-change-password`, …) exist only while it is.
 */
export async function openOperatorAccountMenu(page: Page): Promise<void> {
  const chip = page.getByTestId('oc-account');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-expanded', 'true');
}

/** Opens the console shell's More sheet from the phone rail (below `sm` only) and proves it is up. */
export async function openMoreSheet(page: Page): Promise<void> {
  await awaitRoutedPage(page);
  const more = page.getByTestId('oc-more');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('oc-more-sheet')).toBeVisible();
}

/**
 * The console's phone rail as a viewport must render it: the four slots share one row inside the
 * viewport, the text rail is not shown, the page never scrolls sideways, and the section row's
 * brand, its venue slot and the account chip sit side by side without overlapping.
 */
export async function expectPhoneRailFits(page: Page, label: string): Promise<void> {
  const rail = page.getByRole('navigation', { name: label });
  await expect(rail).toBeVisible();
  const slots = rail.locator(':scope > *');
  await expect(slots).toHaveCount(4);
  const boxes = await slots.evaluateAll((els) =>
    els.map((el) => {
      const box = el.getBoundingClientRect();
      return { top: Math.round(box.top), left: box.left, right: box.right };
    }),
  );
  expect(new Set(boxes.map((box) => box.top)).size).toBe(1);
  const width = page.viewportSize()!.width;
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(width);
  }
  await expect(page.locator('nav[aria-label$="console sections"]')).toBeHidden();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const [brand, venue, chip] = await Promise.all(
    ['oc-brand', 'oc-venue-title', 'oc-account'].map((id) => page.getByTestId(id).boundingBox()),
  );
  expect(brand!.x + brand!.width).toBeLessThanOrEqual(venue!.x + 1);
  expect(venue!.x + venue!.width).toBeLessThanOrEqual(chip!.x + 1);
}
