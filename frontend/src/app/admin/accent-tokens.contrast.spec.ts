import {
  AA_LARGE,
  AA_NORMAL,
  Rgb,
  contrastRatio,
  hexToRgb,
  rgbToHex,
} from '../../testing/contrast';
import {
  ACCENT_BORDER,
  ACCENT_CHIP_BORDER,
  ACCENT_CHIP_FILL,
  ACCENT_FILL,
  ACCENT_INK,
  ACCENT_STRONG,
  DARK_CARD_GLASS,
  DARK_STOPS,
  Glass,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  SOLID_BTN_FILL,
  SOLID_BTN_HOVER,
  SOLID_BTN_INK,
  WHITE,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG guard for the `--riv-accent-*` token family (#835), the positive-state counterpart to
 * `admin-console.contrast.spec.ts`'s negative-state guard.
 *
 * <p>The INK sites are porcelain-only, and for them that is the whole proof rather than half of
 * it: all nine sit inside a console that pins `data-riv-theme="porcelain"` on its host
 * (`admin-console.ts`, `operator-console.ts`), so no other theme can reach them. The subtree
 * pinning that guarantee rests on is not something jsdom maths can see — `accent-token-inks.e2e.ts`
 * pins it against a real render under a forced dark document theme.
 *
 * <p>The TINT tokens are a different matter and are asserted on both surface families. They are
 * theme-invariant, but five tourist components consume them under riviera and dark, where the card
 * glass behind them inverts — so a value chosen on porcelain evidence alone would be half-measured.
 *
 * <p>The teal ink the family replaces was `#0a4f5e`; `--riv-accent-ink` is `#085a6e`, which is
 * LIGHTER, so this migration lowers contrast. That is deliberate (it collapses a near-duplicate
 * out of the palette) and it is bounded here rather than discovered later.
 *
 * <p>Scope is WCAG 1.4.3 TEXT pairs, plus the two non-text (1.4.11) boundaries, which behave
 * differently and so are asserted differently. The active chip's border is OPAQUE and clears 3:1,
 * so it is held there — the sweep briefly lowered it to a 0.75 alpha, which crossed the floor, and
 * this is the test that stops that returning. The panel's border is a tint: it reaches only
 * ~1.6:1 and no alpha of this hue would reach 3:1, so normalising three drifted alphas onto one
 * token can only move it within a band that already fails. The last two tests say where it moves —
 * up on porcelain, DOWN on the dark card glass — rather than claiming a single direction. Raising
 * it to compliance is not this spec's question: the pair is decorative under
 * docs/design/non-text-contrast.md rule 2, the panel ink and chip label carrying the identity.
 */

/** The teal ink these sites painted before the migration, kept for the bounding test. */
const OUTGOING_ACCENT_INK: Rgb = hexToRgb('0a4f5e');

/** The `white/85` pill the console's tabs and outbox buttons paint on. */
const PILL: Glass = { color: WHITE, alpha: 0.85 };

function layer(glass: Glass, base: Rgb): Rgb {
  return surfaceOver(glass, base);
}

/**
 * Every surface a migrated console ink lands on: the bare page stop, the card glass over it, the
 * white pill over that, and the two accent tints over that.
 */
function consoleSurfaces(): readonly Rgb[] {
  return PORCELAIN_STOPS.flatMap((stop) => {
    const glass = layer(PORCELAIN_CARD_GLASS, stop);
    return [
      stop,
      glass,
      layer(PILL, glass),
      layer(ACCENT_FILL, glass),
      layer(ACCENT_CHIP_FILL, glass),
    ];
  });
}

function ratio(ink: Rgb, surface: Rgb): number {
  return contrastRatio(rgbToHex(ink), rgbToHex(surface));
}

describe('Accent token family contrast (WCAG AA, #835)', () => {
  it('the accent ink meets AA on every console surface it lands on', () => {
    for (const surface of consoleSurfaces()) {
      expect(
        ratio(ACCENT_INK, surface),
        `accent ink over ${rgbToHex(surface)}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the migration lowers contrast but never below AA', () => {
    for (const surface of consoleSurfaces()) {
      const before = ratio(OUTGOING_ACCENT_INK, surface);
      const after = ratio(ACCENT_INK, surface);

      expect(after, `accent ink over ${rgbToHex(surface)}`).toBeLessThan(before);
      expect(after, `accent ink over ${rgbToHex(surface)}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the solid-button ink is theme-invariant and meets AA on both fixed fills', () => {
    for (const fill of [SOLID_BTN_FILL, SOLID_BTN_HOVER]) {
      expect(ratio(SOLID_BTN_INK, fill), `solid ink over ${rgbToHex(fill)}`).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    }
  });

  it('the active chip border clears the 1.4.11 non-text floor on both adjacent colours', () => {
    for (const stop of PORCELAIN_STOPS) {
      const glass = layer(PORCELAIN_CARD_GLASS, stop);
      const fill = layer(ACCENT_CHIP_FILL, glass);

      expect(
        ratio(ACCENT_STRONG, fill),
        `chip border over ${rgbToHex(fill)}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
      expect(
        ratio(ACCENT_STRONG, glass),
        `chip border over ${rgbToHex(glass)}`,
      ).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  /**
   * `--riv-accent-chip-border` is the family's fourth non-text boundary and the one nothing
   * measured until #876 — the test above asserts `--riv-accent-strong`, the OPAQUE border the
   * amenity chip wears, which is a different token on a different component. This 0.75-alpha
   * one is worn by `shared/segmented-control.ts`'s selected option, where it clears 3:1 against
   * neither adjacent colour in the light themes. Exempt under docs/design/non-text-contrast.md
   * rule 2 — the option's own bold label carries the identity — and measured here rather than
   * assumed, which is that rule's second condition.
   */
  it('the segmented option border is measured, not assumed exempt', () => {
    for (const [surface, glassToken, stops] of [
      ['porcelain', PORCELAIN_CARD_GLASS, PORCELAIN_STOPS],
      ['dark', DARK_CARD_GLASS, DARK_STOPS],
    ] as const) {
      for (const stop of stops) {
        const glass = layer(glassToken, stop);
        const fill = layer(ACCENT_CHIP_FILL, glass);
        const border = layer(ACCENT_CHIP_BORDER, fill);

        expect(ratio(border, fill), `${surface}: over its own fill`).toBeLessThan(AA_LARGE);
        expect(ratio(border, fill), `${surface}: the measured band's floor`).toBeGreaterThan(1.9);
      }
    }
  });

  it('normalising the panel border does not lower its non-text ratio on porcelain', () => {
    const outgoing: readonly Glass[] = [
      { color: hexToRgb('2bb8d4'), alpha: 0.3 },
      { color: hexToRgb('2bb8d4'), alpha: 0.34 },
      { color: hexToRgb('0e8aa8'), alpha: 0.35 },
    ];

    for (const stop of PORCELAIN_STOPS) {
      const glass = layer(PORCELAIN_CARD_GLASS, stop);
      const fill = layer(ACCENT_FILL, glass);
      const outside = ratio(layer(ACCENT_BORDER, glass), glass);
      const inside = ratio(layer(ACCENT_BORDER, fill), fill);

      for (const border of outgoing) {
        expect(outside, `border over ${rgbToHex(glass)}`).toBeGreaterThanOrEqual(
          ratio(layer(border, glass), glass),
        );
        expect(inside, `border over ${rgbToHex(fill)}`).toBeGreaterThanOrEqual(
          ratio(layer(border, fill), fill),
        );
      }
    }
  });

  it('lowers the panel border on the dark card glass, within one non-compliant band', () => {
    const outgoing: readonly Glass[] = [
      { color: hexToRgb('2bb8d4'), alpha: 0.3 },
      { color: hexToRgb('2bb8d4'), alpha: 0.34 },
    ];

    for (const stop of DARK_STOPS) {
      const glass = layer(DARK_CARD_GLASS, stop);
      const after = ratio(layer(ACCENT_BORDER, glass), glass);

      for (const border of outgoing) {
        expect(after, `border over ${rgbToHex(glass)}`).toBeLessThan(
          ratio(layer(border, glass), glass),
        );
      }

      expect(after, `border over ${rgbToHex(glass)}`).toBeLessThan(AA_LARGE);
    }
  });
});
