import {
  AA_LARGE,
  AA_NORMAL,
  Rgb,
  composite,
  contrastRatio,
  rgbToHex,
} from '../../testing/contrast';
import {
  DARK_MAP_ZOOM_IDLE_BORDER,
  DARK_MAP_ZOOM_IDLE_FILL,
  DARK_MAP_ZOOM_IDLE_INK,
  DARK_MAP_ZOOM_SELECTED_ACCENT,
  DARK_MAP_ZOOM_SELECTED_FILL,
  DARK_WASH_STOPS,
  Glass,
  MAP_ZOOM_IDLE_BORDER,
  MAP_ZOOM_IDLE_FILL,
  MAP_ZOOM_IDLE_INK,
  MAP_ZOOM_SELECTED_BORDER,
  MAP_ZOOM_SELECTED_FILL,
  MAP_ZOOM_SELECTED_INK,
  WASH_STOPS,
} from '../../testing/glass-tokens';

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
  readonly fill: Glass;
  readonly border: Glass;
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
        fill: MAP_ZOOM_SELECTED_FILL,
        border: { color: MAP_ZOOM_SELECTED_BORDER, alpha: 1 },
        ink: MAP_ZOOM_SELECTED_INK,
      },
      {
        name: 'idle',
        fill: MAP_ZOOM_IDLE_FILL,
        border: MAP_ZOOM_IDLE_BORDER,
        ink: MAP_ZOOM_IDLE_INK,
      },
    ],
  },
  {
    name: 'night',
    washStops: DARK_WASH_STOPS,
    states: [
      {
        name: 'selected',
        fill: DARK_MAP_ZOOM_SELECTED_FILL,
        border: { color: DARK_MAP_ZOOM_SELECTED_ACCENT, alpha: 1 },
        ink: DARK_MAP_ZOOM_SELECTED_ACCENT,
      },
      {
        name: 'idle',
        fill: DARK_MAP_ZOOM_IDLE_FILL,
        border: DARK_MAP_ZOOM_IDLE_BORDER,
        ink: DARK_MAP_ZOOM_IDLE_INK,
      },
    ],
  },
];

describe.each(FAMILIES)('Beach-map zoom toggle contrast — $name family (issue #870)', (family) => {
  it.each(family.states)(
    '$name state: "Fit"/"100%" ink meets AA 4.5:1 over every wash stop',
    (state) => {
      for (const stop of family.washStops) {
        const surface = composite(state.fill.color, state.fill.alpha, stop);
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
        const surface = composite(state.fill.color, state.fill.alpha, stop);
        const border = composite(state.border.color, state.border.alpha, surface);
        expect(
          contrastRatio(rgbToHex(border), rgbToHex(surface)),
          `over stop ${rgbToHex(stop)}`,
        ).toBeGreaterThanOrEqual(AA_LARGE);
      }
    },
  );
});
