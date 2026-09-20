/**
 * Where the venue sheet rests over the riviera map, from the shipped chrome as measured at
 * runtime — the tab bar's rendered height (61 on a phone, 0 from `sm` where it is hidden) and
 * the header's (73). Nothing here is a viewport constant: a constant tab bar reserves 61 px on a
 * tablet that has none, and the sheet opens at full instead of half.
 *
 * <p>The sheet is the last child of an outer scroll-snap scroller whose first child is a
 * transparent spacer over the map, so a rest is a `scrollTop`: 0 at peek, the spacer's height at
 * full. `detentAt` names the nearest rest for any position, which is what the page reads while a
 * flick is in flight.
 */

/** The sheet's three resting heights: half opens; peek is the map; full is the list. */
export type Detent = 'peek' | 'half' | 'full';

export interface MeasuredChrome {
  readonly viewportH: number;
  /** The shell header's rendered height. */
  readonly header: number;
  /** The phone tab bar's rendered height, 0 where it is hidden. */
  readonly tabBar: number;
}

export interface SheetTops {
  /** The sheet's top at full: a sliver of map stays under the header, the way back. */
  readonly full: number;
  /** The sheet's top at half: the map band under the header, Airbnb's measured 307. */
  readonly half: number;
  /** The sheet's top at peek: the head alone above the tab bar. */
  readonly peek: number;
  /** Exactly one snapport, so nothing can be flung past full. */
  readonly sheetHeight: number;
}

/** The head is one 78 px row at every height: the grabber and the place · beaches · day strip. */
export const HEAD_PX = 78;
/** At full the map keeps this much under the header — Google Maps' rule. */
export const FULL_SLIVER_PX = 44;
/** The map band at half, under the header. */
export const HALF_MAP_BAND_PX = 307;
/** The foot row over the sheet at rest: Near me and the credit, which the camera fit keeps clear. */
export const FOOT_ROW_PX = 56;

export function sheetTops({ viewportH, header, tabBar }: MeasuredChrome): SheetTops {
  const full = header + FULL_SLIVER_PX;
  return {
    full,
    half: header + HALF_MAP_BAND_PX,
    peek: viewportH - tabBar - HEAD_PX,
    sheetHeight: viewportH - tabBar - full,
  };
}

/** The outer scroller's `scrollTop` at which the sheet rests at `detent`. */
export function offsetFor(tops: SheetTops, detent: Detent): number {
  return tops.peek - tops[detent];
}

/** The nearest rest to a scroll position: half way between two rests decides, past full is full. */
export function detentAt(scrollTop: number, tops: SheetTops): Detent {
  const half = offsetFor(tops, 'half');
  const full = offsetFor(tops, 'full');
  if (scrollTop < half / 2) {
    return 'peek';
  }
  return scrollTop < (half + full) / 2 ? 'half' : 'full';
}

/** Where the sheet's top is for a scroll position, in viewport px. */
export function sheetTop(tops: SheetTops, scrollTop: number): number {
  return Math.max(tops.full, tops.peek - scrollTop);
}

/**
 * The preview lift below full, clamped as a scroller would clamp a `scrollTop`: a short list is
 * never lifted into blank glass, and nothing lifts past the list's end.
 */
export function clampLift(wanted: number, listHeight: number, room: number): number {
  const max = Math.max(0, listHeight - room);
  return Math.min(max, Math.max(0, wanted));
}
