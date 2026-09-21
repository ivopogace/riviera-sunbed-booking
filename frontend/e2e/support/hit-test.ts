import { Page } from '@playwright/test';

/**
 * The `data-testid` of whatever actually receives a pointer at the centre of `testId`'s box — the
 * occlusion question `toBeVisible()` cannot answer. A control painted under a fixed overlay is
 * reported visible, enabled and stable, and every click on it times out; Discover's riviera map
 * swallowed the shared footer exactly that way.
 *
 * <p>`closest` walks up, so the answer is the innermost marked ancestor-or-self of whatever was
 * hit: a label inside a row reports the row. Ask about a **leaf** control for that reason — for a
 * container the answer is one of its descendants, never the container, and an unmarked overlay
 * inside the container's own subtree would report the container as reachable. `undefined` means the
 * point hit nothing, or nothing marked. Assert the id you expect rather than that it merely
 * differs: the interesting failures name the covering layer.
 *
 * <p>Await the target's visibility first — visible, and then actually reachable? — and note that
 * `toBeVisible()` does not imply in-viewport: the centre point must be on screen, so scroll a
 * target below the fold into view before asking.
 */
export async function hitTestId(page: Page, testId: string): Promise<string | undefined> {
  return page.evaluate((id) => {
    const target = document.querySelector(`[data-testid="${id}"]`);
    if (!target) {
      throw new Error(`hitTestId: no element carries data-testid="${id}"`);
    }
    const box = target.getBoundingClientRect();
    return document
      .elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      ?.closest('[data-testid]')
      ?.getAttribute('data-testid');
  }, testId);
}
