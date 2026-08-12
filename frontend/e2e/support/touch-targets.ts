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
 * <p>It settles animations first: `getBoundingClientRect()` returns the TRANSFORMED box, so a
 * surface measured mid-entry reads ~5% small — a 44px control at 42. Same hazard the axe policy
 * documents for mid-fade contrast.
 */
export async function expectTouchTargets(page: Page, label: string): Promise<void> {
  await settle(page);

  const undersized = await page.evaluate(
    ({ controls, floor }) => {
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
          .map((el) => ({ el, box: el.getBoundingClientRect() }))
          .filter(({ el, box }) => {
            if (box.width === 0 || box.height === 0) return false;
            return getComputedStyle(el).visibility !== 'hidden';
          })
          // Round BEFORE comparing: Chromium returns 43.996 for a 44px box.
          .map(({ el, box }) => ({
            selector: describe(el),
            width: Math.round(box.width),
            height: Math.round(box.height),
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
