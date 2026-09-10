import { expect, type Page } from '@playwright/test';

import { settle } from './booking-dialog';

/**
 * The field types iOS Safari zooms the page into on focus — every one that accepts typed or
 * picked input. `checkbox`, `radio`, `range`, `color`, `file` and the button-ish types never
 * take a caret, so their font-size cannot trigger the zoom and is not this sweep's business.
 */
const ZOOMING_INPUT_TYPES = new Set([
  '', // a bare <input> is type="text"
  'text',
  'email',
  'password',
  'number',
  'tel',
  'url',
  'search',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
]);

const FIELDS = 'input, select, textarea';
const FLOOR_PX = 16;

/**
 * Asserts that no visible field on the current page can trigger iOS Safari's auto-zoom-on-focus:
 * the browser zooms the whole page in whenever a focused field's **computed** `font-size` is under
 * 16 px, which on a console reads as the layout jumping every time staff tap an input.
 *
 * <p>Generic over the surface on purpose — the same reason `expectTouchTargets` is: a field added
 * to a covered surface later is covered without editing a list, which is the drift this exists to
 * stop. It reads the computed size rather than the class list because that is the only thing
 * Safari looks at: a `text-[16px]` utility that loses to a more specific rule still zooms, and an
 * unstyled field inheriting 16 px is fine without carrying any size class at all.
 *
 * <p>The fix is never `user-scalable=no`/`maximum-scale=1` — that would defeat the zoom by taking
 * pinch-zoom away from everyone, failing WCAG 1.4.10. Raising the field to 16 px costs nothing.
 */
export async function expectNoFocusZoom(page: Page, label: string): Promise<void> {
  await settle(page);

  const zooming = await page.evaluate(
    ({ fields, floor, types }) => {
      const describe = (el: Element): string => {
        const testid = el.getAttribute('data-testid');
        const tag = el.tagName.toLowerCase();
        if (testid) return `${tag}[data-testid="${testid}"]`;
        const name = el.getAttribute('name') ?? el.getAttribute('formcontrolname');
        if (name) return `${tag}[name="${name}"]`;
        // A Tailwind class list runs to hundreds of chars; a grid of them buries the failure.
        const classes = el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        return classes ? `${tag}.${classes}…` : tag;
      };

      return (
        [...document.querySelectorAll(fields)]
          .filter((el) => {
            if (el.tagName === 'INPUT') {
              const type = (el.getAttribute('type') ?? '').toLowerCase();
              if (!types.includes(type)) return false;
            }
            // No box (`hidden`) means no tap can focus it — the labelled file input is the case.
            const box = el.getBoundingClientRect();
            if (box.width <= 0 || box.height <= 0) return false;
            return getComputedStyle(el).visibility !== 'hidden';
          })
          .map((el) => ({ selector: describe(el), px: parseFloat(getComputedStyle(el).fontSize) }))
          // Round before comparing: a 16px box can read 15.998.
          .filter((f) => Math.round(f.px * 100) / 100 < floor)
      );
    },
    { fields: FIELDS, floor: FLOOR_PX, types: [...ZOOMING_INPUT_TYPES] },
  );

  expect(
    zooming,
    `${label}: ${zooming.length} field(s) under ${FLOOR_PX}px — iOS Safari zooms the page in on ` +
      `focus — ${zooming.map((f) => `${f.selector} at ${f.px}px`).join(' | ')}`,
  ).toEqual([]);
}

/**
 * Asserts every element matching `selector` opts out of the browser's native double-tap-to-zoom
 * (`touch-action: manipulation`), which fires on a fast second tap of a control that has not
 * opted out and zooms the page instead of doing what the control does. It matters on a dense or
 * adjacent cluster — a tile grid, a chip row, a rail of tabs — which is what staff tap through
 * fastest, and which is why the assertion names its cluster rather than sweeping every control.
 *
 * <p>`manipulation` keeps pan and pinch-zoom (so WCAG 1.4.10 is untouched) and drops only the
 * double-tap gesture. It is not `touch-none`: a control driving its own drag gesture — the layout
 * editor's paint cells — needs that instead, and is deliberately not covered here.
 */
export async function expectTouchManipulation(
  page: Page,
  selector: string,
  label: string,
): Promise<void> {
  const found = await page.locator(selector).count();
  expect(
    found,
    `${label}: no control matched \`${selector}\` — the assertion would pass vacuously`,
  ).toBeGreaterThan(0);

  const wrong = await page.locator(selector).evaluateAll((els: Element[]) =>
    els
      .map((el) => ({
        selector: el.getAttribute('data-testid') ?? el.className.split(/\s+/)[0] ?? el.tagName,
        touchAction: getComputedStyle(el).touchAction,
      }))
      .filter((c) => !c.touchAction.split(/\s+/).includes('manipulation')),
  );

  expect(
    wrong,
    `${label}: ${wrong.length} of ${found} control(s) still take the browser's double-tap-zoom — ` +
      `${wrong.map((c) => `${c.selector} is \`touch-action: ${c.touchAction}\``).join(' | ')}`,
  ).toEqual([]);
}
