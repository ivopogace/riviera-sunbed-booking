import { Page } from '@playwright/test';

/**
 * The `data-testid` of whatever actually receives a pointer at the centre of `testId`'s box — the
 * occlusion question `toBeVisible()` cannot answer. A control painted under a fixed overlay is
 * reported visible, enabled and stable, and every click on it times out; Discover's riviera map
 * swallowed the shared footer that way for a whole release.
 *
 * <p>Returns the nearest ancestor's id when the hit lands on an unmarked child (a label inside a
 * row), `null` when nothing in the tree carries one, and `undefined` when the point is outside the
 * document. Assert the id you expect rather than merely that it differs: the interesting failures
 * name the covering layer.
 *
 * <p>The element must already be rendered — await its visibility first, which is also the order the
 * question is worth asking in: visible, and then actually reachable?
 */
export async function hitTestId(page: Page, testId: string): Promise<string | null | undefined> {
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
