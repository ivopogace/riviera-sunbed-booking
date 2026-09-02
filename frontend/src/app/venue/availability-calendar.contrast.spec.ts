import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AA_LARGE,
  AA_NORMAL,
  Rgb,
  composite,
  contrastRatio,
  hexToRgb,
  rgbToHex,
} from '../../testing/contrast';
import {
  CALENDAR_PALETTE,
  CALENDAR_PALETTES,
  DARK_CALENDAR_PALETTE,
  calendarTokenValues,
} from '../../testing/calendar-tints';
import {
  DARK_POP_INK_DISABLED,
  Glass,
  POP_INK_DISABLED,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';
import { baseBlock, declarationsOf, themeBlock } from '../../testing/stylesheet-tokens';

/**
 * WCAG-AA contrast guard for the availability calendar (#761), and the stylesheet contract of its
 * themed day-cell palette (#888).
 *
 * <p>The day cells are proved as **plain pairs**, with no compositing: every tint, the two rings
 * and the capacity bar are OPAQUE (the `semantic-chip` treatment, mirrored in
 * `testing/calendar-tints.ts`). That is the whole reason they are opaque — a translucent day would
 * have to be proved once per theme AND once per background stop, and the proof would then depend
 * on what the popover happens to be floating over. Theming the palette kept that property: there
 * are two palettes, so there are two sets of pairs, and nothing is composited.
 *
 * <p>The popover's own chrome is the exception and IS composited: the calendar is a
 * `--riv-pop-*` consumer, so the month heading, the weekday headers and the footer note are checked
 * over the effective colour of the popover surface on each palette's worst-case gradient stops —
 * the light values over the porcelain and riviera stops, the dark values over the dark ones.
 *
 * <p>What is deliberately NOT asserted, so the omission is a decision rather than a gap: the three
 * tints are **not** required to be 3:1 apart from one another. Three fills of one lightness cannot
 * be, and they do not have to be — the tint is reinforcement, not the carrier. Each day's state is
 * carried by the capacity bar (a length, asserted below at the 1.4.11 bar) and by the exact counts
 * in its accessible name (`day-availability.spec.ts`), so WCAG 1.4.1 is met without leaning on
 * colour discrimination at all.
 */

const APP_ROOT = join(process.cwd(), 'src/app');

function read(path: string): string {
  return readFileSync(join(APP_ROOT, path), 'utf8');
}

/** Every class-string token in a template or a constants file, quotes stripped. */
function classTokens(source: string): readonly string[] {
  return source.replaceAll(/["'`]/g, ' ').split(/\s+/);
}

/** The stylesheet's own notation for an alpha token, so the mirror can be compared to the source. */
function cssValue({ color, alpha }: Glass): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

/** The ratio of an alpha ink against the surface it is composited onto. */
function inkRatio({ color, alpha }: Glass, surface: Rgb): number {
  return contrastRatio(rgbToHex(composite(color, alpha, surface)), rgbToHex(surface));
}

/** The pinned, theme-invariant ramp the calendar wore before it became a popover-family consumer. */
const RETIRED_TOKENS = [
  '--riv-calendar-glass',
  '--riv-calendar-ink',
  '--riv-calendar-ink-soft',
  '--riv-calendar-ink-faint',
  '--riv-calendar-ink-disabled',
  '--riv-calendar-hover',
];

/** The utilities the template wears now: the popover family, plus the palette's own tokens. */
const WORN_UTILITIES = [
  'bg-riv-pop-surface',
  'text-riv-pop-ink',
  'border-riv-pop-border',
  'shadow-riv-pop',
  'text-riv-pop-ink-soft',
  'hover:bg-riv-pop-hover',
  'aria-disabled:text-riv-pop-ink-disabled',
  'text-riv-calendar-accent',
  'bg-riv-calendar-bar-track',
  'bg-riv-calendar-bar-fill',
];

/** The literals the palette now carries, which no calendar source may paint directly. */
const PALETTE_LITERALS = [
  '#0a2a33',
  'rgba(12,42,51,',
  'rgba(255,255,255,0.97)',
  '#0a3f4e',
  '#6f8a91',
  '#085a6e',
  '#dff0e4',
  '#fdeecc',
  '#fae9e9',
  'bg-white',
];

const CALENDAR_SOURCES = ['venue/availability-calendar.html', 'venue/day-availability.ts'];

describe('Availability calendar contrast (WCAG AA) — venue/day-availability.ts', () => {
  describe.each(CALENDAR_PALETTES)(
    'the $name palette (opaque, so each proof is one pair)',
    (palette) => {
      const { ink, tints, accent, selectedRing, bar } = palette;
      const tinted = tints.filter((tint) => tint.state !== 'unknown');

      it.each(tints)('the day number reads AA on the $name fill', ({ fill }) => {
        expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(AA_NORMAL);
      });

      it.each(tints)('the focus ring reads at the 1.4.11 bar on $name', ({ fill }) => {
        expect(contrastRatio(accent, fill)).toBeGreaterThanOrEqual(AA_LARGE);
      });

      it.each(tints)(
        'the chosen-day ring reads at the 1.4.11 bar over the $name fill it is drawn on',
        ({ fill }) => {
          expect(contrastRatio(selectedRing, fill)).toBeGreaterThanOrEqual(AA_LARGE);
        },
      );

      it('the focus ring and the chosen-day ring stay distinguishable from each other', () => {
        // They can appear on the same cell, one as outline and one as inset shadow.
        expect(selectedRing).not.toBe(accent);
      });

      /**
       * The bar is the non-colour carrier of how full a day is, so BOTH of its boundaries are
       * required to understand the content (WCAG 1.4.11): the fill against the track tells you where
       * the free share ends, and the track against the day's tint tells you how long the whole bar
       * is. Without the second, a full day's empty track would be indistinguishable from no bar.
       */
      describe('the capacity bar (1.4.11 — a graphic required to understand the day)', () => {
        it('the fill reads against its track', () => {
          expect(contrastRatio(bar.fill, bar.track)).toBeGreaterThanOrEqual(AA_LARGE);
        });

        it.each(tinted)('the track reads against the $name fill it is drawn on', ({ fill }) => {
          expect(contrastRatio(bar.track, fill)).toBeGreaterThanOrEqual(AA_LARGE);
        });

        /**
         * The chosen day keeps its tint, so the bar keeps the very fills proved above — which is the
         * point of marking selection with a ring instead of an inverted fill. An accent fill would
         * put the bar under the bar on the one day most worth reading.
         */
        it('is drawn on the chosen day too, because selection does not replace the tint', () => {
          for (const { fill } of tinted) {
            expect(contrastRatio(bar.track, fill)).toBeGreaterThanOrEqual(AA_LARGE);
          }
        });
      });

      it('the month-step glyphs read AA on the popover surface over every stop it floats over', () => {
        expectAaOverStops(hexToRgb(accent), 1, palette.surface, palette.stops);
      });
    },
  );

  describe.each(CALENDAR_PALETTES)('the popover chrome under the $name palette', (palette) => {
    it('the month heading and the day numbers read AA on the popover surface over every stop', () => {
      expectAaOverStops(hexToRgb(palette.ink), 1, palette.surface, palette.stops);
    });

    it('the weekday headers and the footer note read AA on the popover surface over every stop', () => {
      expectAaOverStops(
        palette.inkSoft.color,
        palette.inkSoft.alpha,
        palette.surface,
        palette.stops,
      );
    });

    /**
     * Clears no bar and need not: every site wearing it is `aria-disabled`, which WCAG 1.4.3
     * exempts as an inactive component. Pinned in BOTH directions so a retune past 3:1 retires the
     * exemption rather than inheriting it, and one toward invisibility fails.
     */
    it('the disabled ink stays legible-but-weakened over every stop, its whole job', () => {
      for (const stop of palette.stops) {
        const surface = surfaceOver(palette.surface, stop);
        const disabled = inkRatio(palette.inkDisabled, surface);

        expect(disabled, `over ${rgbToHex(stop)}`).toBeGreaterThan(2);
        expect(disabled, `over ${rgbToHex(stop)}`).toBeLessThan(AA_LARGE);
        expect(
          disabled,
          `disabled must read weaker than active over ${rgbToHex(stop)}`,
        ).toBeLessThan(contrastRatio(palette.ink, rgbToHex(surface)));
      }
    });
  });

  /**
   * The verdict retuned the dark theme. The light themes keep every day-cell colour the tree
   * painted as a literal before the palette was tokenised, asserted so a later retune of the light
   * set is a decision argued with here rather than a side effect of the dark one.
   */
  describe('the light palette', () => {
    it('keeps the cell colours the tree painted before it was themed', () => {
      expect(CALENDAR_PALETTE.tints.map((tint) => tint.fill)).toEqual([
        '#dff0e4',
        '#fdeecc',
        '#fae9e9',
        '#ffffff',
      ]);
      expect(CALENDAR_PALETTE.accent).toBe('#0a3f4e');
      expect(CALENDAR_PALETTE.selectedRing).toBe('#085a6e');
      expect(CALENDAR_PALETTE.bar).toEqual({ fill: '#0a3f4e', track: '#6f8a91' });
    });
  });

  describe('the popover chrome', () => {
    it('retires the pinned ramp and consumes the popover family', () => {
      const worn = classTokens(read('venue/availability-calendar.html'));

      for (const utility of WORN_UTILITIES) {
        expect(worn, `the template wears ${utility}`).toContain(utility);
      }
      for (const token of RETIRED_TOKENS) {
        expect(worn.join(' '), `nothing wears ${token}`).not.toContain(
          token.slice('--riv-'.length),
        );
      }
    });

    it.each(CALENDAR_SOURCES)('%s paints no literal the palette carries', (path) => {
      const source = read(path).toLowerCase().replaceAll(' ', '');

      for (const literal of PALETTE_LITERALS) {
        expect(source, `${path} still paints ${literal}`).not.toContain(literal);
      }
    });
  });

  describe('the stylesheet contract', () => {
    const light = new Map(calendarTokenValues(CALENDAR_PALETTE));
    const dark = new Map(calendarTokenValues(DARK_CALENDAR_PALETTE));
    const tokens = [...light.keys()];

    it('mirrors the same token set for both palettes', () => {
      expect([...dark.keys()]).toEqual(tokens);
    });

    it.each(tokens)(
      '%s is declared once for the light themes and once for dark, at the values this mirror carries',
      (token) => {
        expect(declarationsOf(token)).toEqual([light.get(token), dark.get(token)]);
        expect(baseBlock(), `${token} in the base block`).toContain(`${token}:`);
        expect(themeBlock('dark'), `${token} in the dark block`).toContain(`${token}:`);
        expect(themeBlock('riviera'), `${token} not in the riviera block`).not.toContain(
          `${token}:`,
        );
      },
    );

    it.each(tokens)(
      '%s is mapped in `@theme inline`, without which the utility never generates',
      (token) => {
        expect(declarationsOf(`--color-${token.slice('--'.length)}`)).toEqual([`var(${token})`]);
      },
    );

    it("declares the popover family's weakened ink beside the family, themed like the rest of it", () => {
      expect(declarationsOf('--riv-pop-ink-disabled')).toEqual([
        cssValue(POP_INK_DISABLED),
        cssValue(DARK_POP_INK_DISABLED),
      ]);
      expect(declarationsOf('--color-riv-pop-ink-disabled')).toEqual([
        'var(--riv-pop-ink-disabled)',
      ]);
    });

    it.each(RETIRED_TOKENS)('%s is gone — no declaration and no `@theme inline` row', (token) => {
      expect(declarationsOf(token)).toEqual([]);
      expect(declarationsOf(`--color-${token.slice('--'.length)}`)).toEqual([]);
    });
  });
});
