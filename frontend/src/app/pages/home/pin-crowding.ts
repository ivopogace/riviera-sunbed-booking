import { LngLat, ScreenPoint } from '../../shared/map-engine';
import { formatMoney } from '../../shared/money';
import { VenueCard } from './venue-card';

/**
 * The geometry behind the riviera map's venue pins: which pins **crowd** each other at the current
 * camera, the zoom that would separate a crowd, and where a crowd's **place pill** can sit without
 * running over its neighbours. Pure functions over projected points, so a spec drives every case
 * with a stub projection and the layer that draws the result stays thin. Vocabulary: `CONTEXT.md`
 * (_pin crowd_, _place pill_).
 */

/** A venue on the map: the card the list renders for it, and where it sits. Keyed by the venue id. */
export interface VenuePin {
  readonly id: string;
  readonly at: LngLat;
  readonly card: VenueCard;
}

/**
 * Where the open venue stands in a crowd the camera cannot separate — what the pin preview's
 * stepper shows (`k of n here`) and the two neighbours its chevrons step to, wrapping. Absent for
 * a venue on its own or in a crowd the camera can still separate; never `1 of 1`.
 */
export interface CrowdStack {
  readonly index: number;
  readonly count: number;
  readonly place: string;
  readonly prevId: string;
  readonly nextId: string;
}

/** A pin resolved to the map's own box for the current camera. */
export interface PlacedPin extends ScreenPoint {
  readonly pin: VenuePin;
  /** The rendered pill's width for this pin's face; the disc's 44 for a bare one. */
  readonly width: number;
}

/**
 * Pins whose pills bury each other, anchored on their mean position. A pin on its own is a crowd
 * of one. The key is stable while the membership holds, which is what a template tracks by.
 */
export interface PinCrowd extends ScreenPoint {
  readonly key: string;
  /** In feed order — the list's own order, which is the one every surface walks. */
  readonly members: readonly PlacedPin[];
  /** The widest member's pill: what a lone pin occupies, and what a pill has to clear. */
  readonly width: number;
}

/** The map's box, or `null` where nothing has measured it (jsdom lays nothing out). */
export interface MapBox {
  readonly width: number;
  readonly height: number;
}

/** Which way a pill hangs off its point when it cannot sit centred on it. */
export type PillAnchor = 'centre' | 'right' | 'left';

/** Where a crowd's pill sits: hung, or collapsed to its bare count when nothing fits. */
export interface PillPlacement {
  readonly anchor: PillAnchor;
  readonly compact: boolean;
  readonly width: number;
}

/**
 * Every pin's height, and the width of one with nothing written on it: the 44 px touch floor. Two
 * pins closer than this down bury each other whatever they say.
 */
export const PIN_HEIGHT_PX = 44;

/** Clear water two separated pins keep between them after a fit, so a hand can tell them apart. */
const SEPARATION_GAP_PX = 12;
/** Room the fitted crowd keeps from the box's edges, so no pill lands under the map's chrome. */
const FIT_MARGIN_PX = 150;
/** How far a hung pill overlaps its point: the point sits under the pill's near end. */
export const HANG_PX = 22;
/** The priced pin's chrome beyond its glyphs: 12 px padding each side and the 2 px borders. */
const PIN_CHROME_PX = 28;
/** The priced face: `font-extrabold` at 14 px, as the lone pin's badge paints it (`venue-pin-layer.ts`). */
const BADGE_FONT = { weight: 800, sizePx: 14 };
/** Without a canvas to measure on, a glyph of this font is about this many em wide. */
const GLYPH_EM = 0.69;

/** How wide a pin renders for its face: the disc for none, else the badge plus the pin's chrome. */
export function pinWidth(badge: string | null): number {
  if (!badge) {
    return PIN_HEIGHT_PX;
  }
  return Math.max(PIN_HEIGHT_PX, Math.ceil(textWidth(badge, BADGE_FONT) + PIN_CHROME_PX));
}

/**
 * Whether two placed pins bury each other: their pills overlap — closer than half their widths
 * together across, and closer than a pin's height down. Any overlap counts: the buried pin loses
 * part of its face, and the tourist cannot tell which part is the honest one.
 */
export function crowds(a: PlacedPin, b: PlacedPin): boolean {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < PIN_HEIGHT_PX;
}

/**
 * Group pins by where they currently land. One pass in feed order, each pin joining the first
 * crowd whose anchor it overlaps — deterministic, and stable while the camera holds still.
 */
export function crowdPins(
  pins: readonly VenuePin[],
  project: (at: LngLat) => ScreenPoint,
): readonly PinCrowd[] {
  const groups: { anchor: PlacedPin; members: PlacedPin[] }[] = [];
  for (const pin of pins) {
    const { x, y } = project(pin.at);
    const placed: PlacedPin = { pin, x, y, width: pinWidth(pin.card.priceLabel) };
    const home = groups.find((group) => crowds(group.anchor, placed));
    if (home) {
      home.members.push(placed);
    } else {
      groups.push({ anchor: placed, members: [placed] });
    }
  }
  return groups.map(({ members }) => ({
    key: members.map((member) => member.pin.id).join('+'),
    x: mean(members.map((member) => member.x)),
    y: mean(members.map((member) => member.y)),
    members,
    width: Math.max(...members.map((member) => member.width)),
  }));
}

/** The members' mean position — a crowd is at most a few km across, so the mean is its middle. */
export function crowdCentre(crowd: PinCrowd): LngLat {
  return {
    lng: mean(crowd.members.map((member) => member.pin.at.lng)),
    lat: mean(crowd.members.map((member) => member.pin.at.lat)),
  };
}

/**
 * The smallest zoom at which no two members bury each other, with a little water between them —
 * Web Mercator scales every screen offset by `2^Δzoom`, so each pair names the zoom it needs and
 * the crowd needs the largest. Never below the current zoom; capped by the map's ceiling and, where
 * the box is known, by the zoom at which the crowd's span still fits inside the box's margin.
 * Coinciding members ask for the ceiling: no zoom separates them.
 */
export function separationZoom(
  crowd: PinCrowd,
  zoom: number,
  maxZoom: number,
  box: MapBox | null,
): number {
  let needed = zoom;
  const { members } = crowd;
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const scale = separationScale(members[i], members[j]);
      needed = Number.isFinite(scale) ? Math.max(needed, zoom + Math.log2(scale)) : maxZoom;
    }
  }
  return Math.max(zoom, Math.min(needed, fitZoom(crowd, zoom, box), maxZoom));
}

/** How many times a pair's offsets must grow before their pills clear each other on either axis. */
function separationScale(a: PlacedPin, b: PlacedPin): number {
  const across = ((a.width + b.width) / 2 + SEPARATION_GAP_PX) / Math.abs(a.x - b.x);
  const down = (PIN_HEIGHT_PX + SEPARATION_GAP_PX) / Math.abs(a.y - b.y);
  return Math.min(across, down);
}

/** The zoom at which the crowd's span grows to fill the box less its margin; unbounded if unknown. */
function fitZoom(crowd: PinCrowd, zoom: number, box: MapBox | null): number {
  if (!box) {
    return Infinity;
  }
  const xs = crowd.members.map((member) => member.x);
  const ys = crowd.members.map((member) => member.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const room = Math.min(
    spanX > 0 ? (box.width - FIT_MARGIN_PX) / spanX : Infinity,
    spanY > 0 ? (box.height - FIT_MARGIN_PX) / spanY : Infinity,
  );
  return Number.isFinite(room) ? zoom + Math.log2(room) : Infinity;
}

/** The beach when the crowd agrees on one, both when it spans two, a count beyond that. */
export function placeName(beaches: readonly string[]): string {
  if (beaches.length === 1) {
    return beaches[0];
  }
  return beaches.length === 2 ? `${beaches[0]} & ${beaches[1]}` : `${beaches.length} beaches`;
}

/**
 * The crowd's own from-price: the least of its members' — the fact a lone pin already carries —
 * chosen in integer minor units and formatted once (invariant #5), or absent when none is priced.
 */
export function lowestFromPrice(cards: readonly VenueCard[]): string | null {
  const [first, ...rest] = cards.flatMap((card) => (card.fromPrice ? [card.fromPrice] : []));
  if (!first) {
    return null;
  }
  return formatMoney(
    rest.reduce((low, price) => (price.minorUnits < low.minorUnits ? price : low), first),
  );
}

/**
 * Where each crowd's pill sits, largest crowd first: centred on its place, else hung off its point
 * to the right, then the left — whichever first stays inside the box (when known) and clear of
 * every lone pin and every pill already placed — and only then collapsed to its bare count. A lone
 * pin is never moved; it occupies its centred box before any pill is placed.
 */
export function layoutPills(
  crowds: readonly PinCrowd[],
  fullWidth: (crowd: PinCrowd) => number,
  box: MapBox | null,
): ReadonlyMap<string, PillPlacement> {
  const placements = new Map<string, PillPlacement>();
  const taken: Rect[] = [];
  for (const lone of crowds.filter((crowd) => crowd.members.length === 1)) {
    placements.set(lone.key, { anchor: 'centre', compact: false, width: lone.width });
    taken.push(rectAround(lone, lone.width, 'centre'));
  }
  const bySize = crowds
    .filter((crowd) => crowd.members.length > 1)
    .sort((a, b) => b.members.length - a.members.length);
  for (const crowd of bySize) {
    const width = fullWidth(crowd);
    const anchor = ANCHORS.find((candidate) => {
      const rect = rectAround(crowd, width, candidate);
      return inside(rect, box) && !taken.some((other) => intersects(rect, other));
    });
    const placement: PillPlacement = anchor
      ? { anchor, compact: false, width }
      : { anchor: 'centre', compact: true, width: PIN_HEIGHT_PX };
    taken.push(rectAround(crowd, placement.width, placement.anchor));
    placements.set(crowd.key, placement);
  }
  return placements;
}

const ANCHORS: readonly PillAnchor[] = ['centre', 'right', 'left'];

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function rectAround(at: ScreenPoint, width: number, anchor: PillAnchor): Rect {
  const left = anchorLeft(at.x, width, anchor);
  return {
    left,
    top: at.y - PIN_HEIGHT_PX / 2,
    right: left + width,
    bottom: at.y + PIN_HEIGHT_PX / 2,
  };
}

/** The pill's left edge for an anchor: its point under its middle, its right end, or its left end. */
export function anchorLeft(x: number, width: number, anchor: PillAnchor): number {
  switch (anchor) {
    case 'centre':
      return x - width / 2;
    case 'right':
      return x - HANG_PX;
    default:
      return x + HANG_PX - width;
  }
}

function inside(rect: Rect, box: MapBox | null): boolean {
  return (
    !box ||
    (rect.left >= 0 && rect.top >= 0 && rect.right <= box.width && rect.bottom <= box.height)
  );
}

function intersects(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

let measurer: OffscreenCanvasRenderingContext2D | null | undefined;

/**
 * A run of text's rendered width in the page's own family, at a weight and size — the pill's
 * width has to be known before it is drawn, so it is measured rather than read back. Where no
 * canvas exists (jsdom) a per-glyph estimate stands in, and the browser measures for real.
 */
export function textWidth(text: string, font: { weight: number; sizePx: number }): number {
  measurer ??=
    typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1).getContext('2d') : null;
  if (!measurer) {
    return text.length * font.sizePx * GLYPH_EM;
  }
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  measurer.font = `${font.weight} ${font.sizePx}px ${family}`;
  return measurer.measureText(text).width;
}
