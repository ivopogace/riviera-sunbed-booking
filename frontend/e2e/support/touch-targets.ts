import { expect, type Page } from '@playwright/test';

import { settle } from './booking-dialog';

const CONTROLS = 'button, input, select, textarea, a, [role="button"]';
const FLOOR = 44;

/**
 * Asserts the project's 44 px touch-target floor over EVERY visible interactive control on the
 * current page — generic on purpose, so a control added later is covered without editing a list.
 *
 * <p>It measures the rendered box rather than the class list: `min-h-11` is a silent no-op on an
 * element that is still `display: inline`, and a grid tile can carry the class and still be squeezed
 * below the floor by its column. A control that is genuinely exempt carries `data-touch-exempt`,
 * on itself or on an ancestor, and the reason string is what a reviewer reads.
 *
 * <p>Two things it has to get right, each of which it got wrong once:
 * animations are settled first, because `getBoundingClientRect()` returns the TRANSFORMED box and a
 * surface measured mid-entry reads ~5% small; and what it measures is the box a **clipping** ancestor
 * leaves behind, which is not the same as what a **scrolling** ancestor currently shows.
 */
export async function expectTouchTargets(page: Page, label: string): Promise<void> {
  await settle(page);

  const undersized = await page.evaluate(
    ({ controls, floor }) => {
      /**
       * The part of a control a user can actually hit: its box, clamped per axis by each ancestor
       * that CLIPS that axis (`hidden`/`clip`), and unclamped by one that merely SCROLLS it
       * (`auto`/`scroll`) — a scrolled-away control is reachable whole. The walk ends at the
       * nearest scrollable ancestor, since past it the position is the user's to change.
       */
      const hittableBox = (el: Element, box: DOMRect) => {
        let { left, top, right, bottom } = box;
        const scrolls = (o: string) => o === 'auto' || o === 'scroll';
        const clips = (o: string) => o === 'hidden' || o === 'clip';
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          const edge = parent.getBoundingClientRect();
          // Per axis: a clipping axis clamps, a scrolling axis does not.
          if (clips(style.overflowX)) {
            left = Math.max(left, edge.left);
            right = Math.min(right, edge.right);
          }
          if (clips(style.overflowY)) {
            top = Math.max(top, edge.top);
            bottom = Math.min(bottom, edge.bottom);
          }
          if (scrolls(style.overflowX) || scrolls(style.overflowY)) break;
        }
        return { width: right - left, height: bottom - top };
      };

      const describe = (el: Element): string => {
        const testid = el.getAttribute('data-testid');
        const tag = el.tagName.toLowerCase();
        if (testid) return `${tag}[data-testid="${testid}"]`;
        // A Tailwind class list runs to hundreds of chars; a grid of them buries the failure.
        const classes = el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        return classes ? `${tag}.${classes}…` : tag;
      };

      return (
        [...document.querySelectorAll(controls)]
          .filter((el) => !el.closest('[data-touch-exempt]'))
          .map((el) => ({ el, hittable: hittableBox(el, el.getBoundingClientRect()) }))
          .filter(({ el, hittable }) => {
            // Nothing left after clipping, or hidden outright: not a target, and not a finding.
            if (hittable.width <= 0 || hittable.height <= 0) return false;
            return getComputedStyle(el).visibility !== 'hidden';
          })
          // Round BEFORE comparing: Chromium returns 43.996 for a 44px box.
          .map(({ el, hittable }) => ({
            selector: describe(el),
            width: Math.round(hittable.width),
            height: Math.round(hittable.height),
          }))
          .filter((c) => c.width < floor || c.height < floor)
      );
    },
    { controls: CONTROLS, floor: FLOOR },
  );

  expect(
    undersized,
    `${label}: ${undersized.length} control(s) under ${FLOOR}px — ${undersized
      .map((c) => `${c.selector} ${c.width}x${c.height}`)
      .join(' | ')}`,
  ).toEqual([]);
}
