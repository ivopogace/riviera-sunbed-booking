import { expect } from 'vitest';

import { AA_NORMAL, Rgb, composite, contrastRatio, hexToRgb, rgbToHex } from './contrast';

/**
 * The ONE test-side mirror of the `tailwind.css` glass tokens — per-spec hand-copies of these
 * "keep in sync" constants go stale silently, so every glass spec imports these instead. When a
 * token is retuned in `tailwind.css`, this file is the only place the spec suite needs the new value.
 */

export interface Glass {
  readonly color: Rgb;
  readonly alpha: number;
}

export const WHITE: Rgb = hexToRgb('ffffff');
/** Porcelain `--riv-ink` and both themes' `--riv-card-ink`. */
export const INK_DARK: Rgb = hexToRgb('0a2a33');
/** Base of the rgba(12, 42, 51, …) muted-ink family. */
export const CARD_INK: Rgb = hexToRgb('0c2a33');

export const RIVIERA_HEADER_GLASS: Glass = { color: hexToRgb('0a2c3f'), alpha: 0.72 };
export const PORCELAIN_HEADER_GLASS: Glass = { color: WHITE, alpha: 0.6 };
export const DARK_HEADER_GLASS: Glass = { color: hexToRgb('0f172a'), alpha: 0.72 };

/** `--riv-card-glass` per theme; every card spec imports these. The dark theme inverts the whole
 *  card family (dark glass, light inks — the DARK_* mirrors below); riviera/porcelain keep the
 *  white glass with the shared dark-ink constants above. */
export const RIVIERA_CARD_GLASS: Glass = { color: WHITE, alpha: 0.78 };
export const PORCELAIN_CARD_GLASS: Glass = { color: WHITE, alpha: 0.55 };
export const DARK_CARD_GLASS: Glass = { color: hexToRgb('101a2e'), alpha: 0.86 };

/** Dark theme's light card-ink base — `--riv-card-ink` and the rgba(242, 247, 250, …) muted family. */
export const DARK_CARD_INK: Rgb = hexToRgb('f2f7fa');
/** Dark theme's `--riv-accent-ink` (light teal; light themes keep #085a6e). */
export const DARK_ACCENT_INK: Rgb = hexToRgb('7cd7e8');
/** `--riv-error-ink` per ink family (light themes: #a3160e). */
export const DARK_ERROR_INK: Rgb = hexToRgb('ffa9a1');
/** `--riv-error-ink` on the light themes (the dark theme's is DARK_ERROR_INK above). */
export const ERROR_INK: Rgb = hexToRgb('a3160e');
/** `--riv-accent-ink` on the light themes (the dark theme's is DARK_ACCENT_INK above). */
export const ACCENT_INK: Rgb = hexToRgb('085a6e');

/** Dark `--riv-field-fill` / `--riv-field-border` (light themes: the FIELD_*_ALPHA constants). */
export const DARK_FIELD_FILL: Glass = { color: hexToRgb('020a16'), alpha: 0.45 };
export const DARK_FIELD_BORDER: Glass = { color: WHITE, alpha: 0.5 };
/** Dark `--riv-card-track` (light themes: CARD_INK at CARD_TRACK_ALPHA). */
export const DARK_CARD_TRACK: Glass = { color: WHITE, alpha: 0.18 };
/** `--riv-dialog-glass` per ink family (light themes: white 0.82). */
export const DARK_DIALOG_GLASS: Glass = { color: hexToRgb('101a2e'), alpha: 0.94 };
/** Dark `--riv-wash-fill` / `--riv-inset-fill` (light themes: white 0.5 / INSET_FILL below). */
export const DARK_WASH_FILL: Glass = { color: WHITE, alpha: 0.08 };
/** `--riv-inset-fill` on the light themes — the translucent white inset panels inside the
 *  booking cards. Its dark counterpart is DARK_WASH_FILL above, and the gap between the two is
 *  the whole reason a BORDER of the same light value needs its own token (CTA_BORDER, #853). */
export const INSET_FILL: Glass = { color: WHITE, alpha: 0.4 };

/** The `--riv-danger-*` set — the erasure confirm panel's tinted danger treatment: a panel tint
 *  over the card glass, then a stronger action tint over the panel. Light themes here; the dark
 *  counterparts are the DARK_DANGER_* mirrors below. The `*_BORDER` pair is non-text chrome
 *  (WCAG 1.4.11): `ACTION_BORDER` (the Erase button's affordance boundary) is asserted at 3:1
 *  against the panel fill; `DANGER_BORDER` (the panel's own edge) is decorative and is not —
 *  see the contrast spec's header (issue #834). */
export const DANGER_INK: Rgb = hexToRgb('8f2c22');
export const DANGER_FILL: Glass = { color: hexToRgb('b3362b'), alpha: 0.06 };
export const DANGER_BORDER: Glass = { color: hexToRgb('b3362b'), alpha: 0.35 };
export const DANGER_ACTION_FILL: Glass = { color: hexToRgb('b3362b'), alpha: 0.1 };
export const DANGER_ACTION_BORDER: Glass = { color: hexToRgb('b3362b'), alpha: 0.75 };

/** The dark theme's `--riv-danger-*` set. The ink matches DARK_ERROR_INK — porcelain
 *  distinguishes the two reds, dark does not. */
export const DARK_DANGER_INK: Rgb = hexToRgb('ffa9a1');
export const DARK_DANGER_FILL: Glass = { color: hexToRgb('ff8a7a'), alpha: 0.1 };
export const DARK_DANGER_BORDER: Glass = { color: hexToRgb('ff8a7a'), alpha: 0.42 };
export const DARK_DANGER_ACTION_FILL: Glass = { color: hexToRgb('ff8a7a'), alpha: 0.16 };
export const DARK_DANGER_ACTION_BORDER: Glass = { color: hexToRgb('ff8a7a'), alpha: 0.66 };
/** The `--riv-accent-*` tint family (#835) — the brand teal as the three POSITIVE-state tinted
 *  treatments: the info panel, the selected chip, and the pay spinner's track. No dark mirror
 *  exists on purpose; the tokens are declared once and paint the same value in every theme.
 *  The `*_BORDER` values are non-text chrome (WCAG 1.4.11) — see the spec header. */
export const ACCENT_FILL: Glass = { color: hexToRgb('2bb8d4'), alpha: 0.12 };
export const ACCENT_BORDER: Glass = { color: hexToRgb('0e8aa8'), alpha: 0.35 };
export const ACCENT_CHIP_FILL: Glass = { color: hexToRgb('2bb8d4'), alpha: 0.18 };
export const ACCENT_CHIP_BORDER: Glass = { color: hexToRgb('0e8aa8'), alpha: 0.75 };
export const ACCENT_TRACK: Glass = { color: hexToRgb('2bb8d4'), alpha: 0.25 };
export const ACCENT_STRONG: Rgb = hexToRgb('0e8aa8');

/** The `--riv-solid-btn-*` family: the skin of the outline buttons (booking-view / review-panel
 *  Cancel-Keep-Edit-Remove, my-bookings Retry). Theme-invariant as a WHOLE, not just the ink — the
 *  fills do not theme, so nothing painted over them may either: the themed `--riv-danger-ink`
 *  resolves DARK_ERROR_INK over SOLID_BTN_FILL at 1.69:1, light on light. `--riv-solid-btn-ink`
 *  landed at #835; the rest of the family at #851. Guarded by
 *  `booking/solid-btn-tokens.contrast.spec.ts`. */
export const SOLID_BTN_INK: Rgb = hexToRgb('0a4f5e');
export const SOLID_BTN_FILL: Rgb = hexToRgb('f4f6f7');
export const SOLID_BTN_HOVER: Rgb = hexToRgb('e7ebec');
export const SOLID_BTN_DANGER_INK: Rgb = hexToRgb('a3372a');
/** The two outline borders — non-text chrome (WCAG 1.4.11), and MEASURED rather than waved off:
 *  composited over the fill they reach 1.06:1 (neutral) and 1.90:1 (danger), so neither is the
 *  affordance boundary and neither clears 3:1. Unchanged values, carried across by #851 as-is; the
 *  fill's own 1.02:1 against the card glass says this is the glass aesthetic's boundary question,
 *  not this skin's — the same finding `--riv-accent-*` records at ~1.5:1. Decorative under
 *  docs/design/non-text-contrast.md rule 2; raising it would need a darker hue, not more alpha. Mirrored here for the declaration guard and the e2e's
 *  computed-style read. */
export const SOLID_BTN_BORDER: Glass = { color: WHITE, alpha: 0.7 };
export const SOLID_BTN_DANGER_BORDER: Glass = { color: hexToRgb('c85a3c'), alpha: 0.5 };

/** The `--riv-solid-fill-*` family (#854): the nine solid button/badge fills carrying FIXED WHITE
 *  INK, grouped by FORM rather than value. Theme-invariant — the ink cannot theme, so the fills may
 *  not either; both coincidental tokens (`--riv-error-ink`, `--riv-pop-accent`) do theme, which is
 *  why neither is the answer. Full reasoning sits at the declaration in `tailwind.css`.
 *  Guarded by `shared/solid-fill-tokens.contrast.spec.ts`. One brand teal since #861. */
export const SOLID_FILL_BRAND: Rgb = hexToRgb('0a6e85');
export const SOLID_FILL_BRAND_HOVER: Rgb = hexToRgb('0a5e72');
export const SOLID_FILL_DANGER: Rgb = hexToRgb('a3160e');
/** The family's ink, fixed. Not a token: `text-white` is already unthemeable, so declaring one
 *  would add a declaration without removing a literal. Mirrored so the AA proof has a constant. */
export const SOLID_FILL_INK: Rgb = WHITE;
/** The dark theme's `--riv-pop-accent`, the coincidental token for `SOLID_FILL_BRAND` and
 *  `CONSOLE_ACCENT_INK`. Its counterpart for `SOLID_FILL_DANGER` is DARK_ERROR_INK above. */
export const DARK_POP_ACCENT: Rgb = hexToRgb('7cd7e8');
/** `--riv-pop-accent` on the light themes — the popover family's accent (the theme-picker check,
 *  app.html). Third of the three roles sharing this value, and the one that genuinely themes; the
 *  other two are `SOLID_FILL_BRAND` (a fill) and `CONSOLE_ACCENT_INK` (the console's ink). */
export const POP_ACCENT: Rgb = hexToRgb('0a6e85');

/** `--riv-console-accent-ink` (#848) — the operator console's accent ink: prices, projected
 *  takings, owed/net payout figures, the commission chip and the per-tab "Saved" notices.
 *  Its own token despite sharing a value with `SOLID_FILL_BRAND` (a fill under fixed white ink)
 *  and `--riv-pop-accent` (the popover accent, which themes to DARK_POP_ACCENT above) — same
 *  value, three roles. Theme-invariant: every consumer is a child of the porcelain-pinned
 *  `operator-console`, so a dark branch would be unreachable. Full reasoning sits at the
 *  declaration in `tailwind.css`. Guarded by `operator/console-accent-token.contrast.spec.ts`. */
export const CONSOLE_ACCENT_INK: Rgb = hexToRgb('0a6e85');

/** `--riv-console-negative-ink` (#864) — the operator console's negative ink: the reversal net
 *  and its reason chip on the Payouts tab, the failed-check-in notice on the Daily view. The
 *  `negative` pole of the `--riv-console-*-ink` pair; the two share a host, a surface and a
 *  theme-invariance ground, but not a declaration and not a guard.
 *  Its own token despite equalling `SOLID_BTN_DANGER_INK` — that one is the outline BUTTON's ink
 *  on the button's own fixed fill (#851), and `#a3372a`'s `/opacity` tints on the very element
 *  the reason chip is stay #852's. Same value, three roles, and the themed reds are no answer
 *  either: DARK_ERROR_INK over the console's card glass measures 1.84:1. Theme-invariant: every
 *  consumer is a child of the porcelain-pinned `operator-console`, so a dark branch would be
 *  unreachable. Full reasoning sits at the declaration in `tailwind.css`. Guarded by
 *  `operator/console-negative-token.contrast.spec.ts`. */
export const CONSOLE_NEGATIVE_INK: Rgb = hexToRgb('a3372a');

/** `--riv-form-error-fill` / `--riv-form-error-ink` — the three tourist error banners' skin (#850).
 *  Theme-invariant as a PAIR: the fill is a solid composite that does not theme, so the themed
 *  `--riv-error-ink` over it would resolve DARK_ERROR_INK at 1.54:1. Guarded by
 *  `booking/form-error-tokens.contrast.spec.ts`. */
export const FORM_ERROR_FILL: Rgb = hexToRgb('f6e8e7');
export const FORM_ERROR_INK: Rgb = hexToRgb('a3160e');

/** `--riv-card-ink-soft` alpha over the card glass. */
export const CARD_INK_SOFT_ALPHA = 0.78;
/** `--riv-card-ink-faint` alpha over the card glass. */
export const CARD_INK_FAINT_ALPHA = 0.72;
/** `--riv-card-track` alpha (a `CARD_INK` tint) over the card glass. */
export const CARD_TRACK_ALPHA = 0.12;

/**
 * `--riv-field-fill` alpha (white), composited over whichever surface the field sits on —
 * the card glass on Discover/auth, the `0.82` panels in the booking and find dialogs.
 * `venue-map`'s date field is deliberately NOT this token (see that spec's local constant).
 */
export const FIELD_FILL_ALPHA = 0.55;
/** `--riv-field-border` alpha (a `CARD_INK` tint) over the field fill — the WCAG 1.4.11 boundary. */
export const FIELD_BORDER_ALPHA = 0.55;

/** `--riv-track-bg` per theme — the placeholder/track tint for the INK-coloured panel glass,
 *  the counterpart of `--riv-card-track` on the light card glass. */
export const RIVIERA_PANEL_TRACK = { color: WHITE, alpha: 0.25 };
export const PORCELAIN_PANEL_TRACK = { color: CARD_INK, alpha: 0.12 };
export const DARK_PANEL_TRACK = { color: WHITE, alpha: 0.25 };

/** `--riv-chip-bg` per theme (over-glass tint). */
export const RIVIERA_CHIP = { color: WHITE, alpha: 0.16 };
export const PORCELAIN_CHIP = { color: CARD_INK, alpha: 0.05 };
export const DARK_CHIP = { color: WHITE, alpha: 0.16 };

/** The shared beach-map canvas's sea→sand wash stops (`beach-map-canvas.html`, #672) — the
 *  daylight `--riv-map-sea/mid/sand` values (light themes + porcelain-pinned operator surfaces).
 *  The first is `--riv-map-sea`, which the tourist legend band also wears. */
export const WASH_STOPS: readonly Rgb[] = ['cfeef6', 'e7f5f1', 'f6eedb'].map(hexToRgb);
/** The night wash — the dark theme's `--riv-map-sea/mid/sand`. */
export const DARK_WASH_STOPS: readonly Rgb[] = ['14303c', '1c2f33', '2b2a22'].map(hexToRgb);

/** The `--riv-map-zoom-{selected,idle}-*` pair (#870, class F): the Fit/100% zoom toggle's two
 *  states, on the same wash the rail/chip pairs above sit on. Unlike this file's usual class-F
 *  shape (a themed ink drifting over a fixed fill), both halves here were fixed literals and the
 *  WASH itself themes — so the fix is a per-theme pair, not a theme-invariant one. The idle ink
 *  coincides with `--riv-map-rail-ink`'s value in both themes; a different role (a toggle state,
 *  not a row-label chip), so its own token rather than the coincidental one, per
 *  colour-literal-token-audit.md class R. Proof: shared/beach-map-canvas.contrast.spec.ts. */
export const MAP_ZOOM_SELECTED_BORDER: Rgb = hexToRgb('0e7a89');
export const MAP_ZOOM_SELECTED_INK: Rgb = hexToRgb('0a2a33');
export const MAP_ZOOM_IDLE_INK: Rgb = hexToRgb('0a4f5e');
export const MAP_ZOOM_SELECTED_FILL: Glass = { color: WHITE, alpha: 0.8 };
export const MAP_ZOOM_IDLE_FILL: Glass = { color: WHITE, alpha: 0.6 };
export const MAP_ZOOM_IDLE_BORDER: Glass = { color: CARD_INK, alpha: 0.55 };
/** The night wash's zoom-toggle pair — the selected state's border and ink coincide (`#8fd6e2`). */
export const DARK_MAP_ZOOM_SELECTED_ACCENT: Rgb = hexToRgb('8fd6e2');
export const DARK_MAP_ZOOM_IDLE_INK: Rgb = hexToRgb('9adde8');
export const DARK_MAP_ZOOM_SELECTED_FILL: Glass = { color: WHITE, alpha: 0.16 };
export const DARK_MAP_ZOOM_IDLE_FILL: Glass = { color: WHITE, alpha: 0.1 };
export const DARK_MAP_ZOOM_IDLE_BORDER: Glass = { color: WHITE, alpha: 0.45 };

/** Worst-case background-gradient stops a glass surface can sit over, per theme. */
export const RIVIERA_STOPS: readonly Rgb[] = ['93e6f2', 'ffe2b0', '38b6d2', '0a4f6e'].map(hexToRgb);
export const PORCELAIN_STOPS: readonly Rgb[] = ['ffffff', 'eef6f8', 'cfeaf2', 'dfeef2'].map(
  hexToRgb,
);
export const DARK_STOPS: readonly Rgb[] = ['3b4a5f', '2a3648', '33415a', '0b1120'].map(hexToRgb);

/** `--riv-photo-grad` stops — the photo band's placeholder gradient (light themes; the dark
 *  theme swaps in DARK_PHOTO_STOPS below). */
export const PHOTO_STOPS: readonly Rgb[] = ['2bb8d4', '0e8aa8'].map(hexToRgb);
/** The dark theme's `--riv-photo-grad` placeholder stops (light themes: PHOTO_STOPS). */
export const DARK_PHOTO_STOPS: readonly Rgb[] = ['3b4a5f', '24314a', '1a2438'].map(hexToRgb);

/**
 * Every backdrop an overlay on a photo band must survive: both placeholder gradients' own stops
 * plus the two extremes a real uploaded photo can present — pure white and pure black. Since #142
 * the bands back real images, so "worst case" stopped meaning "the gradient's lightest stop".
 */
export const WORST_PHOTOS: readonly Rgb[] = [
  ...PHOTO_STOPS,
  ...DARK_PHOTO_STOPS,
  WHITE,
  hexToRgb('000000'),
];

/** `--riv-mode-chip-glass` — the white glass under the step chips, on both slideshow hosts.
 *  Named for the Discover mode chip, which stopped wearing it at #705 (it took an opaque fill,
 *  which needs no backing); the step chips are now the token's whole population. */
export const MODE_CHIP_GLASS: Glass = { color: WHITE, alpha: 0.85 };

/** `--riv-photo-chrome` — the dot rail's dark backing over a photo (#704). */
export const PHOTO_CHROME: Glass = { color: hexToRgb('0d2828'), alpha: 0.7 };

/** `--riv-photo-chrome-edge` alpha (a `CARD_INK` tint) — the step chip's 1.4.11 boundary (#704). */
export const PHOTO_CHROME_EDGE_ALPHA = 0.6;

/** Effective surface of a glass layer over an opaque stop. */
export function surfaceOver(glass: Glass, stop: Rgb): Rgb {
  return composite(glass.color, glass.alpha, stop);
}

/**
 * Asserts an (optionally alpha) ink meets the threshold on a glass surface over EVERY
 * given stop — the shared AA-over-worst-case-stops loop every glass restyle
 * otherwise re-implements.
 */
export function expectAaOverStops(
  ink: Rgb,
  inkAlpha: number,
  glass: Glass,
  stops: readonly Rgb[],
  threshold: number = AA_NORMAL,
): void {
  for (const stop of stops) {
    const surface = surfaceOver(glass, stop);
    const effectiveInk = composite(ink, inkAlpha, surface);
    expect(
      contrastRatio(rgbToHex(effectiveInk), rgbToHex(surface)),
      `over stop ${rgbToHex(stop)}`,
    ).toBeGreaterThanOrEqual(threshold);
  }
}

/** The `--riv-medallion-*` family (#858, class F-3): the round, centred, `aria-hidden` outcome
 *  glyph in its three states — `booking-confirmation`'s ✓, `booking-pay`'s ✓/⏳/✕,
 *  `request-confirmation`'s ✉, `appFailureIcon`'s ⚠ or 🏖, and since #869 `outcome-card`'s ✓/⏳
 *  (the glyph is per site and carries no meaning; every one is `aria-hidden`).
 *
 *  Grouped by FORM rather than value, the `--riv-solid-fill-*` precedent: these sites carry
 *  three different pairs, and two of the three values coincide with families that are NOT this one
 *  — `#0a5f74` also paints three `bg-` fills (#854/#861) and a `--riv-cta-grad` stop, `#a3372a` is
 *  also `SOLID_BTN_DANGER_INK` and `CONSOLE_NEGATIVE_INK`, and `#fcf0d9`/`#8a5410` is also the
 *  amber NOTICE BANNER's pair, a different form with accessible text.
 *
 *  Theme-invariant as three PAIRS: the fills are fixed and the hosts theme, so a themed ink drifts
 *  — DARK_ACCENT_INK over the positive fill is 1.41:1 and DARK_ERROR_INK over the negative fill is
 *  1.54:1, the same number #850 measured. Full reasoning sits at the declaration in `tailwind.css`.
 *  Guarded by `shared/fixed-fill-token-skins.contrast.spec.ts`. */
export const MEDALLION_POSITIVE_FILL: Rgb = hexToRgb('d9f2f7');
export const MEDALLION_POSITIVE_INK: Rgb = hexToRgb('0a5f74');
export const MEDALLION_WAITING_FILL: Rgb = hexToRgb('fcf0d9');
export const MEDALLION_WAITING_INK: Rgb = hexToRgb('8a5410');
export const MEDALLION_NEGATIVE_FILL: Rgb = hexToRgb('f7e8e4');
export const MEDALLION_NEGATIVE_INK: Rgb = hexToRgb('a3372a');
/** The negative state's border — non-text chrome (WCAG 1.4.11) on a decorative glyph, and MEASURED
 *  rather than waved off: 1.24:1 over its own fill, under 3:1. The same finding `--riv-solid-btn-*`
 *  records at 1.06:1/1.90:1; exempt under docs/design/non-text-contrast.md rule 2a, a decorative
 *  glyph rather than a control. Carried across unchanged.
 *  The positive and waiting states have no border token — theirs is `rgba(255,255,255,0.6)`, the
 *  light `--riv-card-border` value carried as a literal. A neighbouring family of `CTA_BORDER`
 *  below but not the same one (#853 is the 0.4 hairline), and not this slice's either; it has its
 *  own row in the audit ledger. */
export const MEDALLION_NEGATIVE_BORDER: Rgb = hexToRgb('eecdc4');

/** The `--riv-amenity-*` family (#858, class F-3): `shared/amenity-chip.ts`'s two variants — the
 *  neutral amenity tag and the accent "Xm to water" tag — each an ink, an opaque fill and a border.
 *
 *  The **only** positions this slice migrates that carry accessible text, so the only ones that owe
 *  an AA assertion; the medallion sites and the dialog's step badge are all `aria-hidden`. The
 *  recipes themselves live in `testing/chip-fills.ts`, where `shared/amenities.contrast.spec.ts`
 *  proves them against the rendered chip; these constants are the declaration mirror.
 *
 *  Both variants or neither: they are the same three roles in the same `computed()` ternary, and
 *  migrating one would be the mis-cut #858 exists to undo. Named `--riv-amenity-*` rather than
 *  `--riv-chip-*` because that prefix is already the shell chip's (`--riv-chip-bg`,
 *  `--riv-chip-border`) — one hyphen apart is not a distinction, #864's own naming argument.
 *
 *  Theme-invariant: the fills are fixed and `shared/` mounts this directive from the Discover card
 *  and the dark glass map header alike, so a themed ink drifts — DARK_ACCENT_INK over the water fill
 *  is 1.37:1 and DARK_CARD_INK over the tag fill 1.04:1, against the shipped 6.00 and 8.37:1. Full
 *  reasoning sits at the declaration in `tailwind.css`. Guarded by
 *  `shared/fixed-fill-token-skins.contrast.spec.ts`.
 *
 *  The borders are non-text chrome (WCAG 1.4.11), measured at 1.15:1 and 1.17:1 over their own
 *  fills — the same finding as `--riv-solid-btn-*`, decorative under
 *  docs/design/non-text-contrast.md rule 2. */
export const AMENITY_TAG_INK: Rgb = hexToRgb('2f4a54');
export const AMENITY_TAG_FILL: Rgb = hexToRgb('eef2f4');
export const AMENITY_TAG_BORDER: Rgb = hexToRgb('dbe4e7');
export const AMENITY_WATER_INK: Rgb = hexToRgb('0a5f74');
export const AMENITY_WATER_FILL: Rgb = hexToRgb('d7eef4');
export const AMENITY_WATER_BORDER: Rgb = hexToRgb('b9e0ea');

/** The `--riv-step-*` pair (#858, class F-3): `booking-dialog`'s step-number badge, the decorative
 *  `aria-hidden` numeral in the dialog's teal header. Two states, one `[class]` ternary.
 *
 *  Deliberately TWO tokens for two states rather than four, because each state already has one
 *  unthemeable half pinning the other — and in opposite directions. The active state's fill is
 *  `bg-white`; the idle state's ink is `text-white`. Naming either would add a declaration without
 *  removing a literal or adding a guarantee, the call `--riv-solid-fill-*` already records.
 *
 *  Theme-invariant: the fixed halves pin the tokenised ones, and the dialog is a tourist surface
 *  that themes. The themed --riv-accent-ink resolves DARK_ACCENT_INK at 1.65:1 over the white active
 *  fill. Shipped: 7.24:1 active, 5.11:1 idle — a floor these values happen to clear, since the badge
 *  is aria-hidden and owes no AA assertion. Full reasoning sits at the declaration in
 *  `tailwind.css`. Guarded by `shared/fixed-fill-token-skins.contrast.spec.ts`. */
export const STEP_ACTIVE_INK: Rgb = hexToRgb('0a5f74');
export const STEP_IDLE_FILL: Rgb = hexToRgb('2c7789');
/** The two unthemeable halves, mirrored so the AA floors above have constants rather than literals.
 *  Not tokens, and that is the point — see the pair's header. */
export const STEP_ACTIVE_FILL: Rgb = WHITE;
export const STEP_IDLE_INK: Rgb = WHITE;

/** The `--riv-notice-banner-*` pair (#868, class F-4): the amber notice banner —
 *  `withheld-email-notice`'s "we couldn't email you" notice and the two legal pages' standing
 *  draft banner. The medallion-waiting pair's exact value, on a different FORM: a rectangular
 *  block of accessible text, so unlike `--riv-medallion-waiting-*` this family genuinely owes AA
 *  (5.54:1) rather than being exempt as decorative.
 *
 *  Theme-invariant as a PAIR, the `--riv-form-error-*` call: the fill is fixed and every host
 *  themes, so the themed `--riv-error-ink`/`--riv-danger-ink` drift — both resolve DARK_ERROR_INK
 *  (`#ffa9a1`) in the dark theme, 1.63:1 over a fill that stays `#fcf0d9`. Full reasoning sits at
 *  the declaration in `tailwind.css`. Guarded by `booking/withheld-email-notice.contrast.spec.ts`. */
export const NOTICE_BANNER_FILL: Rgb = hexToRgb('fcf0d9');
export const NOTICE_BANNER_INK: Rgb = hexToRgb('8a5410');

/** `--riv-cta-border` (#853, class R): the white hairline bevel on the primary CTA button — 16
 *  positions across `auth/`, `booking/` and `shared/`, grouped by FORM: one bevel, one kind of
 *  fixed teal action surface (the `--riv-cta-grad` stops and `booking-dialog`'s close-button fill).
 *  Theme-invariant, so the mirror is one value rather than a per-theme pair; the alternatives it
 *  rejects, and the ratios behind them, sit at the declaration in `tailwind.css`. Guarded by
 *  `shared/cta-border-token.contrast.spec.ts`. */
export const CTA_BORDER: Glass = { color: WHITE, alpha: 0.4 };
/** `--riv-cta-grad`'s two stops as opaque surfaces — what the hairline composites over. */
export const CTA_GRAD_STOPS: readonly Rgb[] = ['0c7288', '0a5f74'].map(hexToRgb);
/** `booking-dialog`'s close-button fill, the one member of the family that is not the gradient. */
export const DIALOG_CLOSE_FILL: Rgb = hexToRgb('31798a');
/** The dark theme's `--riv-card-border` (light themes: white 0.6) — mirrored as the themed
 *  alternative CTA_BORDER is measured against. */
export const DARK_CARD_BORDER: Glass = { color: WHITE, alpha: 0.16 };

/** The **class-O tint tokens** (#852): the base colour behind every position carrying Tailwind's
 *  `/opacity` modifier. The audit's class O is settled on rule **B** — the modifier stays at the
 *  call site and the literal inside it becomes a token — because `bg-[#2bb8d4]/20` and
 *  `bg-riv-select-tint/20` compile to the SAME `color-mix(in oklab, … , transparent)` expression;
 *  measured, 29 (colour x alpha) pairs over 5 host colours composite byte-identically. So the
 *  mirror carries one value per base colour and no alpha: the alpha is per-site, and stays beside
 *  the comment explaining it (`beach-cell`'s `/55`-not-`/35` aisle boundary is the worked example).
 *
 *  Every one is THEME-INVARIANT by decision rather than omission — each consumer is either a child
 *  of `operator-console`, whose host pins porcelain, or sits on a fixed-white panel — so the
 *  single-declaration guard is the whole protection. Guarded by
 *  `shared/class-o-tint-tokens.contrast.spec.ts`; proven against a real render, in a forced dark
 *  document, by `e2e/class-o-tint-tokens.e2e.ts`. Per-surface AA/1.4.11 ratios stay with their
 *  elements — this slice moves no pixel, so none of them changed.
 *
 *  NOT a palette: several of these values coincide with a registered token of a DIFFERENT role
 *  (`#0e8aa8` is `--riv-accent-strong`, `#a3160e` is `--riv-solid-fill-danger`), and the audit's
 *  class R exists for exactly that. Role before value — see each declaration in `tailwind.css`. */
export const CLASS_O_TINTS: readonly { readonly token: string; readonly value: string }[] = [
  /** The console's neutral tint base — hairlines, inset fills, one sheet backdrop. The rgba base of
   *  `--riv-ink-soft`/`--riv-ink-faint` (CARD_INK above), and deliberately NOT `--riv-ink`, which
   *  is `#0a2a33` and themes to white. */
  { token: '--riv-console-tint', value: '#0c2a33' },
  /** The payout-statement modal backdrop. */
  { token: '--riv-console-scrim', value: '#061e28' },
  /** The console's selection chrome — the set-editor's selected tier and armed-move panel, the
   *  layout editor's active tool. Its own pair, NOT `--riv-accent-fill`/`--riv-accent-strong`,
   *  whose values these are: that family is the TOURIST accent tint (info panel, selected chip,
   *  pay spinner track), this one is operator-console selection state. The same fork #848, #858
   *  and #864 each resolved the same way — role before value. */
  { token: '--riv-select-tint', value: '#2bb8d4' },
  { token: '--riv-select-edge', value: '#0e8aa8' },
];
