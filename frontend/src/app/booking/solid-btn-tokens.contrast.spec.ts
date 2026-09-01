import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { AA_NORMAL, contrastRatio, rgbToHex } from '../../testing/contrast';
import {
  DARK_ACCENT_INK,
  DARK_ERROR_INK,
  SOLID_BTN_BORDER,
  SOLID_BTN_DANGER_BORDER,
  SOLID_BTN_DANGER_INK,
  SOLID_BTN_FILL,
  SOLID_BTN_HOVER,
  SOLID_BTN_INK,
  type Glass,
} from '../../testing/glass-tokens';
import { baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for the `--riv-solid-btn-*` family (#851, class F-2 of the colour-literal audit) — the skin
 * the outline buttons wear (`booking-view` and `review-panel`'s Cancel/Keep/Edit/Remove, and
 * `my-bookings`' row Retry).
 *
 * <p>The family is THEME-INVARIANT as a WHOLE, and that is the decision rather than an omission.
 * `--riv-solid-btn-ink` was the first half, tokenised at #835 over a fill that stayed a literal;
 * this completes it. The fills do not theme, so nothing painted over them may: the themed
 * `--riv-danger-ink` resolves `#ffa9a1` in the dark theme, landing at 1.69:1 on a fill that stays
 * `#f4f6f7` — light on light — and `--riv-accent-ink` at 1.52:1. The second test is those bounds,
 * kept in the tree so the reason survives the decision (the same shape #850 used for
 * `--riv-form-error-*`, which measured 1.54:1).
 *
 * <p>Which makes the invariance itself the thing to protect, and jsdom maths cannot see it: a dark
 * override added later would leave every ratio here passing. So the declaration tests read
 * `src/tailwind.css` as text (the `core/theme-boot.spec.ts` drift-guard pattern) and assert each
 * token is declared once, in the base block, at the value this mirror carries. The cross-theme proof
 * against a real render — where the cascade, not a regex, decides — is `e2e/solid-btn-token-skin.e2e.ts`.
 */

/** How `tailwind.css` writes an rgba token (spaced, unlike a Tailwind arbitrary value). */
function cssRgba({ color, alpha }: Glass): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

/**
 * The whole family, with the value `tailwind.css` is expected to declare for it. `--riv-solid-btn-ink`
 * is included although #835 shipped it: the invariance is a property of the family, and a dark
 * override on the ink breaks the skin exactly as one on the fill would.
 */
const FAMILY = {
  '--riv-solid-btn-ink': rgbToHex(SOLID_BTN_INK),
  '--riv-solid-btn-fill': rgbToHex(SOLID_BTN_FILL),
  '--riv-solid-btn-hover': rgbToHex(SOLID_BTN_HOVER),
  '--riv-solid-btn-border': cssRgba(SOLID_BTN_BORDER),
  '--riv-solid-btn-danger-ink': rgbToHex(SOLID_BTN_DANGER_INK),
  '--riv-solid-btn-danger-border': cssRgba(SOLID_BTN_DANGER_BORDER),
} as const;

const APP = join(process.cwd(), 'src/app');

function componentSources(): readonly string[] {
  return readdirSync(APP, { recursive: true, encoding: 'utf8' }).filter(
    (path) => /\.(ts|html)$/.test(path) && !path.endsWith('.spec.ts'),
  );
}

function read(path: string): string {
  return readFileSync(join(APP, path), 'utf8');
}

/**
 * Roles unique to this family wherever they appear, so they are swept tree-wide. Both fills occur
 * nowhere else, and `rgba(200,90,60,0.5)` is the outline danger border — deliberately NOT
 * `rgba(200,90,60,·)`, because `booking-view`'s solid `btnDanger` gradient button carries the same
 * hue at alpha `0.4`, a different skin this slice must not touch.
 */
const GLOBAL_ROLES = [/#f4f6f7/i, /#e7ebec/i, /rgba\(200,\s*90,\s*60,\s*0\.5\)/i];

/**
 * Roles this family owns only INSIDE its own three components — the discriminator #850's pair did
 * not need. Two literals here are shared with unrelated roles elsewhere and a tree-wide sweep would
 * wrongly demand those change too:
 *
 * <ul>
 *   <li>`#a3372a` has other homes — the over-claim #851 exists to avoid. Three remain since #864
 *       moved the console's three PLAIN inks onto `--riv-console-negative-ink`: the two class-F
 *       medallions (`shared/failure-panel`, `booking/booking-pay`, both #858's), and
 *       `payouts-tab.html`'s `/opacity` form, which is #852's;
 *   <li>`border-[rgba(255,255,255,0.7)]` also skins `auth/auth-page`'s back button (over a
 *       translucent fill, not this solid one) and `venue/availability-calendar`'s popover.
 * </ul>
 */
const FAMILY_COMPONENTS = [
  'booking/booking-view.ts',
  'booking/review-panel.ts',
  'booking/my-bookings.ts',
];
const SCOPED_ROLES = [/#a3372a/i, /border-\[rgba\(255,\s*255,\s*255,\s*0\.7\)\]/i];

/**
 * The out-of-family `#a3372a` positions, by file. Asserted POSITIVELY: the sweep proving the family
 * moved is only half the claim, and this is the half that proves it did not overreach — the same
 * check the issue's AC calls for.
 *
 * <p>The list shrinks as the other tickets holding these positions land, and each removal is a
 * migration this guard is watching for, never a relaxation. #864 took `operator/payouts-tab.ts`
 * and `operator/daily-view-tab.html` off it by moving the console's PLAIN inks onto
 * `--riv-console-negative-ink`; #858 then took `shared/failure-panel.ts` and
 * `booking/booking-pay.ts` by moving their decorative outcome medallions onto
 * `--riv-medallion-negative-ink`. `payouts-tab.html` is the last entry and stays because its
 * `/opacity` chip tints (#852's) do — the same element, a different position. One entry per line so
 * the next removal is a deletion rather than a rewrite.
 */
const OUT_OF_FAMILY = ['operator/payouts-tab.html'];

describe('Solid outline-button token family (WCAG AA + theme invariance, #851)', () => {
  it('both inks clear AA on both fills', () => {
    for (const ink of [SOLID_BTN_INK, SOLID_BTN_DANGER_INK]) {
      for (const fill of [SOLID_BTN_FILL, SOLID_BTN_HOVER]) {
        expect(
          contrastRatio(rgbToHex(ink), rgbToHex(fill)),
          `${rgbToHex(ink)} on ${rgbToHex(fill)}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    }
  });

  it('the themed inks would not — which is why the family exists', () => {
    for (const themed of [DARK_ERROR_INK, DARK_ACCENT_INK]) {
      expect(
        contrastRatio(rgbToHex(themed), rgbToHex(SOLID_BTN_FILL)),
        `${rgbToHex(themed)} on the fixed fill`,
      ).toBeLessThan(AA_NORMAL);
    }
  });

  it('declares each token exactly once, so no theme block can override it', () => {
    for (const name of Object.keys(FAMILY)) {
      expect(declarationsOf(name), `${name} declarations`).toHaveLength(1);
    }
  });

  it('declares the family in the base block, where it resolves for all three themes', () => {
    const base = baseBlock();

    for (const name of Object.keys(FAMILY)) {
      expect(base, `${name} in the base block`).toContain(`${name}:`);
    }
  });

  it('declares the values this test mirror carries', () => {
    for (const [name, value] of Object.entries(FAMILY)) {
      expect(declarationsOf(name)[0], name).toBe(value);
    }
  });

  it('leaves no component painting the family as a literal', () => {
    const treeWide = componentSources().filter((path) =>
      GLOBAL_ROLES.some((role) => role.test(read(path))),
    );
    const scoped = FAMILY_COMPONENTS.filter((path) =>
      SCOPED_ROLES.some((role) => role.test(read(path))),
    );

    expect([...treeWide, ...scoped]).toEqual([]);
  });

  it('leaves the out-of-family #a3372a sites untouched', () => {
    const stillPainting = OUT_OF_FAMILY.filter((path) => /#a3372a/i.test(read(path)));

    expect(stillPainting).toEqual(OUT_OF_FAMILY);
  });
});
