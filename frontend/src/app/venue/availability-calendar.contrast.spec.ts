import {
  AA_LARGE,
  AA_NORMAL,
  Rgb,
  composite,
  contrastRatio,
  hexToRgb,
  rgbToHex,
} from '../../testing/contrast';
import { CALENDAR_BAR, CALENDAR_SELECTED, CALENDAR_TINTS } from '../../testing/calendar-tints';
import { PORCELAIN_STOPS, RIVIERA_STOPS, surfaceOver } from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the availability calendar (#761).
 *
 * <p>The day cells are proved as **plain pairs**, with no compositing and no per-theme case: every
 * tint, the selected day's accent and the capacity bar are OPAQUE (the `semantic-chip` treatment,
 * mirrored in `testing/calendar-tints.ts`). That is the whole reason they are opaque — a
 * translucent day would have to be proved once per theme AND once per background stop, and the
 * proof would then depend on what the popover happens to be floating over.
 *
 * <p>The popover's own chrome is the exception and IS composited: its surface is a near-opaque
 * white glass, so the month heading, the weekday headers and the footer note are checked over the
 * effective colour on BOTH themes' worst-case gradient stops.
 *
 * <p>What is deliberately NOT asserted, so the omission is a decision rather than a gap: the three
 * tints are **not** required to be 3:1 apart from one another. Three light fills cannot be, and
 * they do not have to be — the tint is reinforcement, not the carrier. Each day's state is carried
 * by the capacity bar (a length, asserted below at the 1.4.11 bar) and by the exact counts in its
 * accessible name (`day-availability.spec.ts`), so WCAG 1.4.1 is met without leaning on colour
 * discrimination at all.
 */

/** The popover's own surface: near-opaque white, so the composite barely moves per theme. */
const POPOVER_GLASS = { color: hexToRgb('ffffff'), alpha: 0.97 };

/** The inks the popover chrome sets on that surface: [name, hex, alpha]. */
const CHROME_INKS: readonly [string, string, number][] = [
  ['the month heading', '0a2a33', 1],
  ['the weekday column headers', '0c2a33', 0.72],
  ['the footer note', '0c2a33', 0.78],
];

const THEMES: readonly [string, readonly Rgb[]][] = [
  ['riviera', RIVIERA_STOPS],
  ['porcelain', PORCELAIN_STOPS],
];

describe('Availability calendar contrast (WCAG AA) — venue/day-availability.ts', () => {
  describe('the day cells (opaque, so one proof serves both themes)', () => {
    it.each(CALENDAR_TINTS)('the day number reads AA on the $name fill', ({ ink, fill }) => {
      expect(contrastRatio(ink, fill)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it('the chosen day reads AA on its accent', () => {
      expect(contrastRatio(CALENDAR_SELECTED.ink, CALENDAR_SELECTED.fill)).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    });

    it.each([...CALENDAR_TINTS, CALENDAR_SELECTED])(
      'the focus ring reads at the 1.4.11 bar on $name',
      ({ fill, ring }) => {
        expect(contrastRatio(ring, fill)).toBeGreaterThanOrEqual(AA_LARGE);
      },
    );
  });

  /**
   * The bar is the non-colour carrier of how full a day is, so BOTH of its boundaries are
   * required to understand the content (WCAG 1.4.11): the fill against the track tells you where
   * the free share ends, and the track against the day's tint tells you how long the whole bar is.
   * Without the second, a full day's empty track would be indistinguishable from no bar at all.
   */
  describe('the capacity bar (1.4.11 — a graphic required to understand the day)', () => {
    it('the fill reads against its track', () => {
      expect(contrastRatio(CALENDAR_BAR.fill, CALENDAR_BAR.track)).toBeGreaterThanOrEqual(AA_LARGE);
    });

    it.each(CALENDAR_TINTS.filter((tint) => !tint.name.startsWith('unknown')))(
      'the track reads against the $name fill it is drawn on',
      ({ fill }) => {
        expect(contrastRatio(CALENDAR_BAR.track, fill)).toBeGreaterThanOrEqual(AA_LARGE);
      },
    );

    /**
     * The bar's colours cannot read on the chosen day's dark accent — the arithmetic below is why,
     * and it is asserted rather than described so the day the accent changes, this fails loudly
     * instead of the bar quietly becoming legible-looking. The component draws no bar there
     * (`availability-calendar.spec.ts` pins that), which is what keeps this from being a violation.
     */
    it('could not read on the chosen day, which is why no bar is drawn there', () => {
      expect(contrastRatio(CALENDAR_BAR.track, CALENDAR_SELECTED.fill)).toBeLessThan(AA_LARGE);
      expect(contrastRatio(CALENDAR_BAR.fill, CALENDAR_SELECTED.fill)).toBeLessThan(AA_LARGE);
    });
  });

  describe.each(THEMES)('the popover chrome over the %s background', (_theme, stops) => {
    it.each(CHROME_INKS)('%s reads AA on the popover surface', (_name, hex, alpha) => {
      for (const stop of stops) {
        const surface = surfaceOver(POPOVER_GLASS, stop);
        const ink = composite(hexToRgb(hex), alpha, surface);
        expect(contrastRatio(rgbToHex(ink), rgbToHex(surface))).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });
  });
});
