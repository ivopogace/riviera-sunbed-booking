import { LngLat, ScreenPoint } from '../../../shared/map-engine';
import { VenueCard } from '../venue-card';

/**
 * THROWAWAY PROTOTYPE — the geometry the variants share, and nothing else.
 * Each variant owns its whole look; only this maths is common, because all of them have to agree on
 * *which pins crowd each other* before they can disagree about what to do next.
 */

/**
 * A pin the prototype draws. Unlike `shared/riviera-map.ts`'s `MapPin` it carries the venue card
 * outright: the chooser is the consumer's business, and the consumer is the one with the venue
 * vocabulary. That split is itself a prototype finding — see the README.
 */
export interface PrototypePin {
  readonly id: string;
  readonly at: LngLat;
  readonly card: VenueCard;
  /** What production writes on the pin's face — the from-price — or nothing for the plain dot. */
  readonly badge?: string;
  /** The venue's from-price in integer minor units, for a crowd's own "from" figure. */
  readonly fromMinor: number | null;
}

/** A pin resolved to the map's own box for the current camera. */
export interface PlacedPin extends ScreenPoint {
  readonly pin: PrototypePin;
  /** The rendered pill's width for this pin's badge; 44 for a bare dot. */
  readonly width: number;
}

/** Pins that land within a finger of each other, with the anchor they crowd around. */
export interface PinCluster extends ScreenPoint {
  /** Stable across camera moves while the membership holds, so `@for` can track it. */
  readonly key: string;
  readonly members: readonly PlacedPin[];
  /** The widest member's pill: what a ring or a tail has to clear. */
  readonly width: number;
}

/**
 * The finger. Two pin centres closer than this cannot both be pressed, whatever their size — which
 * is the whole defect: at the opening zoom that is 6.8 km of coastline (the issue's scale table). It
 * is also every pin's height, and the width of a pin with nothing written on it.
 */
export const CROWD_PX = 44;

/**
 * The existing venue pin, lifted verbatim from `VENUE_PIN_CLASSES` so a prototype pin is
 * indistinguishable from a production one and every variant is judged on what it ADDS. Since the
 * from-price landed on the pin it is a pill, 44 px high and at least 44 px wide, that widens with
 * its badge: {@link MAP_CHROME_BADGE} on the priced face, {@link MAP_CHROME_DOT} on the bare one.
 * Shared across the variants the way a real shared `<Header>` would be — the skin is the app's,
 * not a variant's. Theme-invariant on purpose: it sits on imagery, which never themes.
 */
export const MAP_CHROME_DISC =
  'inline-flex h-11 min-w-11 touch-manipulation items-center justify-center rounded-full ' +
  'border-2 border-riv-solid-btn-border bg-riv-solid-btn-fill leading-none ' +
  'text-riv-solid-btn-ink shadow-[0_6px_18px_rgba(7,42,58,0.35)] ' +
  'aria-expanded:bg-riv-solid-btn-ink aria-expanded:text-riv-solid-btn-fill';

/** The priced face: production's badge, tabular so two prices sit the same width side by side. */
export const MAP_CHROME_BADGE =
  'px-[12px] text-[14px] font-extrabold tabular-nums whitespace-nowrap';

/** The bare face: the placement pin's dot, at its size. */
export const MAP_CHROME_DOT = 'text-[20px]';

/** The face's classes for a pin: the badge's when it has one, the dot's otherwise. */
export function pinFaceClass(pin: PrototypePin): string {
  return pin.badge ? MAP_CHROME_BADGE : MAP_CHROME_DOT;
}

/** What the face shows: the badge, or the dot. */
export function pinFaceText(pin: PrototypePin): string {
  return pin.badge ?? '\u25cf';
}

/** The pill's horizontal padding and borders — what its width is beyond the badge's glyphs. */
const PILL_CHROME_PX = 28;

/** The badge's font, for measuring; the fallback is jsdom's, which has no canvas. */
const BADGE_FONT = '800 14px';
const FALLBACK_CHAR_PX = 9.7;

/**
 * How wide the pin renders for a badge — measured in the browser at 57 px for a two-digit euro
 * price and 67 px for three digits, against the 44 px dot. A prototype pin is as wide as the
 * production one, so the overlap it measures is the overlap the tourist meets.
 */
export function pinWidth(badge: string | undefined): number {
  if (!badge) {
    return CROWD_PX;
  }
  return Math.max(CROWD_PX, Math.ceil(textWidth(badge, BADGE_FONT) + PILL_CHROME_PX));
}

/**
 * Whether two placed pins bury each other: their pills overlap — closer than half their widths
 * together across, and closer than a pin's height down. Any overlap counts, as it did when the
 * pin was a disc and the rule was a 44 px centre distance: the buried pin loses part of its face
 * to the other, and the tourist has no way of knowing which part is the honest one.
 */
export function crowds(a: PlacedPin, b: PlacedPin): boolean {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.y - b.y) < CROWD_PX;
}

/**
 * Group pins by where they currently land. Single pass in feed order, each pin joining the first
 * open cluster whose anchor it overlaps — deterministic, and stable while the camera holds still,
 * which is what lets a rendered pin keep its DOM element across a move.
 */
export function clusterPins(
  pins: readonly PrototypePin[],
  project: (at: LngLat) => ScreenPoint,
): readonly PinCluster[] {
  const groups: { anchor: PlacedPin; members: PlacedPin[] }[] = [];
  for (const pin of pins) {
    const { x, y } = project(pin.at);
    const placed: PlacedPin = { pin, x, y, width: pinWidth(pin.badge) };
    const home = groups.find((group) => crowds(group.anchor, placed));
    if (home) {
      home.members.push(placed);
    } else {
      groups.push({ anchor: placed, members: [placed] });
    }
  }
  return groups.map((group) => ({
    key: group.members.map((member) => member.pin.id).join('+'),
    ...centroid(group.members),
    members: group.members,
    width: Math.max(...group.members.map((member) => member.width)),
  }));
}

/**
 * How far out a fan of `count` pins has to sit for neighbours on the ring to clear each other. The
 * chord between adjacent pins is `2r·sin(π/n)`, so the ring grows with the crowd rather than
 * being a fixed radius that a five-venue beach would overflow — and with the pill, whose width is
 * what two neighbours side by side must clear, not the finger alone.
 *
 * <p>`minimum` is the caller's, and the two callers want opposite things: a fan opened ON A PRESS
 * can afford to be generous, because it is temporary and sits over a scrim; a fan that is ALWAYS
 * on has to stay as tight as the finger allows, or the displacement out-measures the geography it
 * is drawn over.
 */
export function fanRadius(count: number, minimum: number, chord = CROWD_PX): number {
  const needed = count < 2 ? 0 : chord / 2 / Math.sin(Math.PI / count) + 5;
  return Math.max(minimum, needed);
}

/**
 * Where each member of a fan sits relative to its anchor. Starts straight up and runs clockwise,
 * so a pair reads as one above the other rather than as an arbitrary diagonal.
 */
export function fanOffsets(
  count: number,
  minimum: number,
  chord = CROWD_PX,
): readonly ScreenPoint[] {
  const radius = fanRadius(count, minimum, chord);
  return Array.from({ length: count }, (_unused, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
}

let measurer: CanvasRenderingContext2D | null | undefined;

/** A run of text's rendered width in the page's own family, at `font` (a CSS weight and size). */
export function textWidth(text: string, font: string): number {
  if (measurer === undefined) {
    measurer = globalThis.document?.createElement('canvas').getContext('2d') ?? null;
  }
  if (!measurer) {
    return text.length * FALLBACK_CHAR_PX;
  }
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  measurer.font = `${font} ${family}`;
  return measurer.measureText(text).width;
}

function centroid(points: readonly ScreenPoint[]): ScreenPoint {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / points.length, y: sum.y / points.length };
}
