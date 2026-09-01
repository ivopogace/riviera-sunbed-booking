import {
  AA_NORMAL,
  Rgb,
  composite,
  contrastRatio,
  hexToRgb,
  rgbToHex,
} from '../../testing/contrast';
import {
  CARD_INK,
  CARD_INK_SOFT_ALPHA,
  DARK_ACCENT_INK,
  DARK_CARD_GLASS,
  DARK_CARD_INK,
  DARK_STOPS,
  DARK_WASH_FILL,
  Glass,
  INK_DARK,
  INSET_FILL,
  PORCELAIN_CARD_GLASS,
  PORCELAIN_STOPS,
  RIVIERA_CARD_GLASS,
  RIVIERA_STOPS,
  expectAaOverStops,
  surfaceOver,
} from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the Liquid Glass "You're booked." confirmation card. A centered
 * card-glass surface on the bare themed gradient, so every pair is the EFFECTIVE colour
 * composited over the theme's worst-case stops (the venue-map pattern). Mirrors
 * `booking-confirmation.ts`. The ✓ badge is decorative (aria-hidden) — 1.4.11-exempt.
 */

const ACCENT = '#085a6e'; // --riv-accent-ink (Paid, big code, link)
const CTA_STOPS = ['#0c7288', '#0a5f74']; // --riv-cta-grad — the "Back to the beach" button

interface Theme {
  readonly name: string;
  readonly stops: readonly Rgb[];
  readonly cardGlass: Glass;
  readonly cardInk: Rgb; // --riv-card-ink
  readonly cardInkBase: Rgb; // base of the muted rgba ink family
  readonly accent: Rgb; // --riv-accent-ink
  readonly insetFill: Glass; // --riv-inset-fill
}
const LIGHT_INKS = {
  cardInk: INK_DARK,
  cardInkBase: CARD_INK,
  accent: hexToRgb(ACCENT.slice(1)),
  insetFill: INSET_FILL,
};
const DARK_INKS = {
  cardInk: DARK_CARD_INK,
  cardInkBase: DARK_CARD_INK,
  accent: DARK_ACCENT_INK,
  insetFill: DARK_WASH_FILL,
};
const THEMES: readonly Theme[] = [
  { name: 'riviera', stops: RIVIERA_STOPS, cardGlass: RIVIERA_CARD_GLASS, ...LIGHT_INKS },
  { name: 'porcelain', stops: PORCELAIN_STOPS, cardGlass: PORCELAIN_CARD_GLASS, ...LIGHT_INKS },
  { name: 'dark', stops: DARK_STOPS, cardGlass: DARK_CARD_GLASS, ...DARK_INKS },
];

describe('Confirmation card — theme-independent CTA (WCAG AA, issue #137)', () => {
  it('the primary button (white) meets AA over both CTA-gradient stops', () => {
    for (const stop of CTA_STOPS) {
      expect(contrastRatio('#ffffff', stop), `over stop ${stop}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
});

describe.each(THEMES)(
  'Confirmation card glass contrast — $name theme (WCAG AA, issue #137)',
  (theme) => {
    it('card ink (heading, summary values) meets AA on the card glass', () => {
      expectAaOverStops(theme.cardInk, 1, theme.cardGlass, theme.stops);
    });

    it('card ink-soft (lead, summary keys, code label + note) meets AA on the card glass', () => {
      expectAaOverStops(theme.cardInkBase, CARD_INK_SOFT_ALPHA, theme.cardGlass, theme.stops);
    });

    it('accent ink (Paid amount, big booking code, manage link) meets AA on the card glass', () => {
      expectAaOverStops(theme.accent, 1, theme.cardGlass, theme.stops);
    });
  },
);

/**
 * The summary `<dl>` sits on an EXTRA layer the tests above do not model: an inset fill over the
 * card glass. It painted a `rgba(255,255,255,0.4)` literal in every theme until #853, and that is
 * where the layer mattered — a fixed pale fill under inks that DO theme is the #850 trap, and it
 * was live: in the dark theme the list's two inks measured 2.62–3.29:1, below AA, while every
 * assertion above (which composites the same inks on the card glass alone) stayed green.
 *
 * <p>`--riv-inset-fill` is the right token because it is a FILL and the role matches — the code
 * panel seventeen lines below in the same component already wears it — and because it themes with
 * its host: white 0.4 light, 0.08 dark. The retired literal's bound is kept below so the reason
 * survives the decision.
 */
function insetSurfaces(theme: Theme, fill: Glass): readonly Rgb[] {
  return theme.stops.map((stop) => surfaceOver(fill, surfaceOver(theme.cardGlass, stop)));
}

function worstRatio(ink: Rgb, alpha: number, surfaces: readonly Rgb[]): number {
  return Math.min(
    ...surfaces.map((surface) =>
      contrastRatio(rgbToHex(composite(ink, alpha, surface)), rgbToHex(surface)),
    ),
  );
}

describe.each(THEMES)('Confirmation summary list — $name theme (#853)', (theme) => {
  it('both inks meet AA on the inset fill over the card glass', () => {
    const surfaces = insetSurfaces(theme, theme.insetFill);

    expect(
      worstRatio(theme.cardInkBase, CARD_INK_SOFT_ALPHA, surfaces),
      'ink-soft keys',
    ).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(worstRatio(theme.accent, 1, surfaces), 'accent Paid amount').toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });
});

describe('Confirmation summary list — the retired literal (#853)', () => {
  it('a fixed white 0.4 fill put the dark theme under AA, which is why the token themes', () => {
    const dark = THEMES.find((theme) => theme.name === 'dark')!;
    const surfaces = insetSurfaces(dark, INSET_FILL);

    expect(
      worstRatio(dark.cardInkBase, CARD_INK_SOFT_ALPHA, surfaces),
      'ink-soft keys',
    ).toBeLessThan(AA_NORMAL);
    expect(worstRatio(dark.accent, 1, surfaces), 'accent Paid amount').toBeLessThan(AA_NORMAL);
  });
});
