import {
  AA_LARGE,
  AA_NORMAL,
  Rgb,
  composite,
  contrastRatio,
  hexToRgb,
  rgbToHex,
} from '../../testing/contrast';
import { DARK_WASH_STOPS, WASH_STOPS } from '../../testing/glass-tokens';

/**
 * WCAG-AA contrast guard for the shared beach-map canvas's own chrome — currently just the
 * Fit/100% zoom toggle (#713), the ONE piece of `beach-map-canvas.html` not already proven by
 * `venue/venue-map.contrast.spec.ts` (that file proves every token `venue-map.html` sets itself;
 * this canvas-level control is the shared component's own).
 *
 * Issue #870: both toggle states used to pin a fixed hex ink over a fixed rgba fill, composited
 * onto the sea→sand wash — which themes (`--riv-map-sea/mid/sand` has a night counterpart). The
 * dark wash dropped the selected label to ~1.2:1 and the idle one to ~3.8:1, both under AA 4.5:1,
 * on a control that carries accessible text ("Fit", "100%"). Fixed: `--riv-map-zoom-{selected,
 * idle}-{fill,border,ink}`, per-theme like the sibling `--riv-map-rail-*`/`--riv-map-chip-*`
 * pairs this same wash already carries — not a theme-invariant pair, because it is the WASH that
 * would otherwise pin a themed ink wrong, not a fixed fill.
 *
 * Per-family shape borrowed from `venue-map.contrast.spec.ts`'s `MAP_FAMILIES`: daylight
 * (riviera, porcelain, every porcelain-pinned operator surface) and night (the dark theme).
 */

interface ZoomState {
  readonly name: string;
  readonly fill: Rgb;
  readonly fillAlpha: number;
  readonly border: Rgb;
  readonly borderAlpha: number;
  readonly ink: Rgb;
}

interface ZoomFamily {
  readonly name: string;
  readonly washStops: readonly Rgb[];
  readonly states: readonly ZoomState[];
}

const FAMILIES: readonly ZoomFamily[] = [
  {
    name: 'daylight',
    washStops: WASH_STOPS,
    states: [
      {
        name: 'selected',
        fill: hexToRgb('ffffff'),
        fillAlpha: 0.8,
        border: hexToRgb('0e7a89'),
        borderAlpha: 1,
        ink: hexToRgb('0a2a33'),
      },
      {
        name: 'idle',
        fill: hexToRgb('ffffff'),
        fillAlpha: 0.6,
        border: hexToRgb('0c2a33'),
        borderAlpha: 0.55,
        ink: hexToRgb('0a4f5e'),
      },
    ],
  },
  {
    name: 'night',
    washStops: DARK_WASH_STOPS,
    states: [
      {
        name: 'selected',
        fill: hexToRgb('ffffff'),
        fillAlpha: 0.16,
        border: hexToRgb('8fd6e2'),
        borderAlpha: 1,
        ink: hexToRgb('8fd6e2'),
      },
      {
        name: 'idle',
        fill: hexToRgb('ffffff'),
        fillAlpha: 0.1,
        border: hexToRgb('ffffff'),
        borderAlpha: 0.45,
        ink: hexToRgb('9adde8'),
      },
    ],
  },
];

describe.each(FAMILIES)('Beach-map zoom toggle contrast — $name family (issue #870)', (family) => {
  it.each(family.states)(
    '$name state: "Fit"/"100%" ink meets AA 4.5:1 over every wash stop',
    (state) => {
      for (const stop of family.washStops) {
        const surface = composite(state.fill, state.fillAlpha, stop);
        expect(
          contrastRatio(rgbToHex(state.ink), rgbToHex(surface)),
          `over stop ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    },
  );

  it.each(family.states)(
    '$name state: the border marks the button boundary at 3:1 (WCAG 1.4.11)',
    (state) => {
      for (const stop of family.washStops) {
        const surface = composite(state.fill, state.fillAlpha, stop);
        const border = composite(state.border, state.borderAlpha, surface);
        expect(
          contrastRatio(rgbToHex(border), rgbToHex(surface)),
          `over stop ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_LARGE);
      }
    },
  );
});
