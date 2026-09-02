import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AA_LARGE,
  AA_NORMAL,
  Rgb,
  composite,
  contrastRatio,
  rgbToHex,
} from '../../testing/contrast';
import { CALENDAR_TINTS } from '../../testing/calendar-tints';
import {
  BANNER_BODY_INK,
  BANNER_FILLS,
  BANNER_STRONG_INK,
  CALENDAR_GLASS,
  CONSOLE_BTN_BORDER,
  CONSOLE_CARD_BORDER,
  CALENDAR_HOVER,
  CALENDAR_INK,
  CALENDAR_INK_DISABLED,
  CALENDAR_INK_FAINT,
  CALENDAR_INK_SOFT,
  DARK_CARD_INK,
  DARK_STOPS,
  Glass,
  PORCELAIN_STOPS,
  RIVIERA_STOPS,
  WHITE,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';
import { baseBlock, declarationsOf } from '../../testing/stylesheet-tokens';

/**
 * Guard for the families #849 (class T-3) turned out to need — and for the refusal that defines
 * them.
 *
 * <p><strong>The ticket asked the wrong question, and the answer is worth stating before the
 * assertions.</strong> #849 enumerated fourteen `#0a2a33` / `rgba(12,42,51,·)` positions whose
 * value already equalled a registered token, and asked which of `--riv-ink`, `--riv-card-ink` or
 * `--riv-pop-ink` each one wanted. Two things were wrong with it. Six of the fourteen no longer
 * exist — #870 (PR #873) consumed them with the beach-map zoom toggle, taking the whole
 * `rgba(12,42,51,0.66)` family with it. And of the eight that survive, **not one can take any of
 * the three**: every one sits on a fill that does not theme, so a themed ink over it drifts
 * light-on-light in dark — class F's failure mode, the very bug the ticket was written to prevent,
 * reached by following the ticket. `the ticket's candidate tokens would fail on every one of these
 * surfaces` is that claim, measured.
 *
 * <p>So the population is not class T at all. It is class **F** (a fixed fill pins every ink on
 * it — the `--riv-solid-btn-ink` precedent) and class **R** (a value coincidence over a role
 * mismatch — the fork #848, #858, #864 and #879 each resolved the same way). This file guards the
 * four families that replaced the three candidates, and `docs/design/colour-literal-token-audit.md`
 * carries the reasoning per site.
 *
 * <p>It lives in `shared/` rather than beside any one consumer because the population spans
 * `venue/`, `booking/` and `operator/` — the same home, and the same reason, as
 * `warn-token-skin.contrast.spec.ts` and `fixed-fill-token-skins.contrast.spec.ts`. The
 * complementary proof, where the cascade rather than a regex decides, is
 * `e2e/fixed-ink-token-recut.e2e.ts`.
 */

/** The calendar's own popover surface and the dark-ink ramp it pins. */
const CALENDAR_FAMILY = {
  '--riv-calendar-glass': cssValue(CALENDAR_GLASS),
  '--riv-calendar-ink': rgbToHex(CALENDAR_INK),
  '--riv-calendar-ink-soft': cssValue(CALENDAR_INK_SOFT),
  '--riv-calendar-ink-faint': cssValue(CALENDAR_INK_FAINT),
  '--riv-calendar-ink-disabled': cssValue(CALENDAR_INK_DISABLED),
  '--riv-calendar-hover': cssValue(CALENDAR_HOVER),
} as const;

/** `booking-view`'s banner prose and the six fixed fills that pin it. */
const BANNER_FAMILY = {
  '--riv-banner-body-ink': rgbToHex(BANNER_BODY_INK),
  '--riv-banner-strong-ink': rgbToHex(BANNER_STRONG_INK),
} as const;

/** The console's two white-surface hairlines. */
const CONSOLE_FAMILY = {
  '--riv-console-card-border': cssValue(CONSOLE_CARD_BORDER),
  '--riv-console-btn-border': cssValue(CONSOLE_BTN_BORDER),
} as const;

const THEMES: readonly [string, readonly Rgb[]][] = [
  ['riviera', RIVIERA_STOPS],
  ['porcelain', PORCELAIN_STOPS],
  ['dark', DARK_STOPS],
];

/** The literals every migrated site must have stopped painting. */
const MIGRATED_LITERALS = [
  '#0a2a33',
  'rgba(12,42,51,0.78)',
  'rgba(12,42,51,0.72)',
  'rgba(12,42,51,0.4)',
  'rgba(12,42,51,0.35)',
  'rgba(12,42,51,0.07)',
  'rgba(255,255,255,0.97)',
  'rgba(12,42,51,0.1)',
  'rgba(12,42,51,0.14)',
];

const APP_ROOT = join(process.cwd(), 'src/app');

function read(path: string): string {
  return readFileSync(join(APP_ROOT, path), 'utf8');
}

/** The stylesheet's own notation for an alpha token, so the mirror can be compared to the source. */
function cssValue({ color, alpha }: Glass): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

describe('The T-3 re-cut — fixed-fill and role-mismatch ink families (#849)', () => {
  /**
   * The whole slice's premise in one test. Written over the candidates' DARK values because that
   * is the only branch where they diverge: all three resolve `#0a2a33` in porcelain, which is
   * exactly why the ticket read them as interchangeable and why a byte-identical substitution
   * would have shipped a bug no porcelain screenshot could show.
   */
  describe("the ticket's candidate tokens would fail on every one of these surfaces", () => {
    const CANDIDATES: readonly [string, string][] = [
      ['--riv-card-ink / --riv-pop-ink (dark: #f2f7fa)', rgbToHex(DARK_CARD_INK)],
      ['--riv-ink (riviera and dark: #ffffff)', rgbToHex(WHITE)],
    ];

    describe.each(CANDIDATES)('%s', (_name, ink) => {
      it.each(THEMES)('is below AA on the calendar popover over the %s stops', (_theme, stops) => {
        for (const stop of stops) {
          const surface = rgbToHex(surfaceOver(CALENDAR_GLASS, stop));
          expect(contrastRatio(ink, surface), `over ${surface}`).toBeLessThan(AA_NORMAL);
        }
      });

      it.each(CALENDAR_TINTS)('is below AA on the $name day fill', ({ fill }) => {
        expect(contrastRatio(ink, fill)).toBeLessThan(AA_NORMAL);
      });
    });
  });

  describe('the calendar family', () => {
    it.each(THEMES)(
      'the primary ink clears AA on the popover glass over the %s stops',
      (_theme, stops) => {
        expectAaOverStops(CALENDAR_INK, 1, CALENDAR_GLASS, stops);
      },
    );

    it.each(THEMES)(
      'the footer note clears AA on the popover glass over the %s stops',
      (_theme, stops) => {
        expectAaOverStops(CALENDAR_INK_SOFT.color, CALENDAR_INK_SOFT.alpha, CALENDAR_GLASS, stops);
      },
    );

    it.each(THEMES)(
      'the weekday headers clear AA on the popover glass over the %s stops',
      (_theme, stops) => {
        expectAaOverStops(
          CALENDAR_INK_FAINT.color,
          CALENDAR_INK_FAINT.alpha,
          CALENDAR_GLASS,
          stops,
        );
      },
    );

    /**
     * The disabled ink is the one position in this family that clears no bar, and the honest
     * reading is that it is not required to. WCAG 2.2 SC 1.4.3 exempts "text that is part of an
     * inactive user interface component" outright, and 1.4.11 carves out inactive components the
     * same way; every site wearing this token is `aria-disabled="true"`. That the control stays
     * focusable (the repo prefers `aria-disabled` to `disabled` so focus is never stranded) does
     * not make it active — it is still an inactive component, announced as one.
     *
     * <p>This is NOT `non-text-contrast.md` rule 2 or 2a. Those are about a control's chrome
     * being decorative because its content carries the identity; this is text, and the ground is
     * the criterion's own incidental clause. The file warns against blurring the two, so the
     * ground is named rather than borrowed.
     *
     * <p>Nothing here is new — the outgoing literals measured 2.05–2.38:1 and were never asserted
     * at all. The migration is what made the number visible, so it is pinned in both directions:
     * a retune that pushes it past 3:1 should retire the exemption rather than inherit it, and one
     * that drops it toward invisibility fails.
     */
    it.each(THEMES)(
      'the disabled ink stays legible-but-weakened on the %s stops, its whole job',
      (_theme, stops) => {
        for (const stop of stops) {
          const surface = surfaceOver(CALENDAR_GLASS, stop);
          const disabled = inkRatio(CALENDAR_INK_DISABLED, surface);

          expect(disabled, `over ${rgbToHex(stop)}`).toBeGreaterThan(2);
          expect(disabled, `over ${rgbToHex(stop)}`).toBeLessThan(AA_LARGE);
          expect(
            disabled,
            `disabled must read weaker than active over ${rgbToHex(stop)}`,
          ).toBeLessThan(contrastRatio(rgbToHex(CALENDAR_INK), rgbToHex(surface)));
        }
      },
    );

    it.each(CALENDAR_TINTS)('the primary ink clears AA on the $name day fill', ({ fill }) => {
      expect(contrastRatio(rgbToHex(CALENDAR_INK), fill)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    /**
     * The one deliberate repaint in the slice. The nav arrow's disabled ink was `0.35` and the day
     * cell's `0.4` — 0.05 apart for no stated reason, the drift #879's alpha ladder exists to
     * collapse. They merge at the HIGHER-contrast of the two, so the site that moves moves the safe
     * way and the other does not move at all. A comparison, not a threshold: "still clears 3:1"
     * would have been true of the losing choice too, and would not say why this one was picked.
     */
    it('merges the two disabled alphas at the higher-contrast of them', () => {
      const surface = surfaceOver(CALENDAR_GLASS, PORCELAIN_STOPS[0]);
      const outgoing = { color: CALENDAR_INK_DISABLED.color, alpha: 0.35 };

      expect(inkRatio(CALENDAR_INK_DISABLED, surface)).toBeGreaterThan(inkRatio(outgoing, surface));
    });
  });

  describe('the banner family', () => {
    it.each(BANNER_FILLS.map((fill) => [rgbToHex(fill), fill] as const))(
      'both inks clear AA on the %s banner fill',
      (hex) => {
        expect(contrastRatio(rgbToHex(BANNER_BODY_INK), hex), 'body').toBeGreaterThanOrEqual(
          AA_NORMAL,
        );
        expect(contrastRatio(rgbToHex(BANNER_STRONG_INK), hex), 'strong').toBeGreaterThanOrEqual(
          AA_NORMAL,
        );
      },
    );

    /**
     * The refusal at its sharpest. `--riv-card-ink`'s dark value on the neutral banner is not
     * merely under AA — it is very nearly white on white, which is what "a latent dark-theme bug"
     * means concretely.
     */
    it.each(BANNER_FILLS.map((fill) => [rgbToHex(fill), fill] as const))(
      'the candidate card ink would be near-invisible on the %s banner fill',
      (hex) => {
        expect(contrastRatio(rgbToHex(DARK_CARD_INK), hex)).toBeLessThan(1.5);
      },
    );

    /**
     * The eyebrow inks are deliberately NOT in this family — six values across six states is class
     * S's per-state palette. Asserted so the omission reads as a decision: if a later slice folds
     * them in, this is the test that has to be argued with.
     */
    it('leaves the per-state eyebrow inks as literals, a class-S palette this family does not claim', () => {
      expect(read('booking/booking-view.ts')).toMatch(/eyebrowPending: 'text-\[#8a5410\]'/);
    });
  });

  describe('the console border families', () => {
    /**
     * Both hairlines bound an opaque white fill, so there is no compositing and no per-theme case:
     * one plain pair each. Non-text chrome under WCAG 1.4.11 — measured rather than assumed
     * exempt, `non-text-contrast.md`'s second condition.
     */
    it.each([
      ['the card border', CONSOLE_CARD_BORDER, 1.21],
      ['the button border', CONSOLE_BTN_BORDER, 1.32],
    ] as const)('%s is measured against the white fill it bounds', (_name, border, expected) => {
      expect(inkRatio(border, WHITE)).toBeCloseTo(expected, 2);
    });

    /**
     * Both are far under 3:1, which is the whole reason they owe a recorded ground rather than an
     * assumption. The tab pill and the sign-out button are controls whose own labels carry the
     * identity — `non-text-contrast.md` rule 2. The card border's other consumer, the "Venue not
     * found" card, is a `<div>`: outside 1.4.11 rather than exempt under it, since nothing about
     * that card is identified by its hairline.
     */
    it('records that neither hairline reaches the 1.4.11 bar, so the exemption is load-bearing', () => {
      expect(inkRatio(CONSOLE_CARD_BORDER, WHITE)).toBeLessThan(AA_LARGE);
      expect(inkRatio(CONSOLE_BTN_BORDER, WHITE)).toBeLessThan(AA_LARGE);
    });

    /**
     * The role objection, made mechanical. These two tokens must not BE the coincidental ones —
     * if a later slice collapses them back onto `--riv-pop-divider` or `--riv-chip-border`, the
     * console inherits the popover's and the tourist chip's theme overrides, which is the whole
     * thing #849's re-cut refused.
     */
    it('keeps the coincidental tokens themed and separate, which is why these exist', () => {
      expect(declarationsOf('--riv-pop-divider')).toHaveLength(2);
      expect(declarationsOf('--riv-chip-border')).toHaveLength(3);
    });
  });

  describe('the stylesheet contract', () => {
    const ALL = { ...CALENDAR_FAMILY, ...BANNER_FAMILY, ...CONSOLE_FAMILY };

    it('declares each token exactly once, so no theme block can override it', () => {
      for (const name of Object.keys(ALL)) {
        expect(declarationsOf(name), `${name} declarations`).toHaveLength(1);
      }
    });

    it('declares the family in the base block, where it resolves for all three themes', () => {
      const base = baseBlock();

      for (const name of Object.keys(ALL)) {
        expect(base, `${name} in the base block`).toContain(`${name}:`);
      }
    });

    it('declares the values this test mirror carries', () => {
      for (const [name, value] of Object.entries(ALL)) {
        expect(declarationsOf(name)[0], name).toBe(value);
      }
    });

    it('is mapped in `@theme inline`, without which the utilities never generate', () => {
      for (const name of Object.keys(ALL)) {
        expect(
          declarationsOf(`--color-riv-${name.slice('--riv-'.length)}`),
          `the @theme inline row for ${name}`,
        ).toEqual([`var(${name})`]);
      }
    });

    /**
     * The three tokens the ticket proposed are refused, not retuned: this slice must leave them
     * byte-identical. Without this, "we chose our own tokens instead" and "we quietly widened
     * `--riv-card-ink`" would look the same in a diff.
     */
    it('leaves the three candidate tokens exactly as it found them', () => {
      expect(declarationsOf('--riv-ink')).toEqual(['#0a2a33', '#ffffff', '#ffffff']);
      expect(declarationsOf('--riv-card-ink')).toEqual(['#0a2a33', '#f2f7fa']);
      expect(declarationsOf('--riv-pop-ink')).toEqual(['#0a2a33', '#f2f7fa']);
    });
  });

  describe('the sites', () => {
    const SITES = [
      'venue/availability-calendar.html',
      'booking/booking-view.ts',
      'operator/operator-console.html',
      'operator/operator-actions.ts',
    ];

    it.each(SITES)('%s paints no migrated literal', (path) => {
      const source = read(path).toLowerCase().replaceAll(' ', '');

      for (const literal of MIGRATED_LITERALS) {
        expect(source, `${path} still paints ${literal}`).not.toContain(literal);
      }
    });

    /**
     * The positive half. The sweep above asserts absences, which a mistyped path would satisfy
     * vacuously — #852's emptied-guard lesson, now a standing shape rather than a habit.
     */
    it.each(SITES)('%s paints its family', (path) => {
      expect(read(path), `${path} paints a re-cut family`).toMatch(
        /-riv-(calendar|banner|console-card-border|console-btn-border)-?/,
      );
    });
  });
});

/** The ratio of an alpha ink against the surface it is composited onto. */
function inkRatio({ color, alpha }: Glass, surface: Rgb): number {
  return contrastRatio(rgbToHex(composite(color, alpha, surface)), rgbToHex(surface));
}
