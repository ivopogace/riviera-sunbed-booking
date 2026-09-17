import { LngLat, ScreenPoint } from '../../../shared/map-engine';
import { VenueCard } from '../venue-card';

/**
 * THROWAWAY PROTOTYPE (issue #1134) — the geometry the three variants share, and nothing else.
 * Each variant owns its whole look; only this maths is common, because all three have to agree on
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
}

/** A pin resolved to the map's own box for the current camera. */
export interface PlacedPin extends ScreenPoint {
  readonly pin: PrototypePin;
}

/** Pins that land within a finger of each other, with the anchor they crowd around. */
export interface PinCluster extends ScreenPoint {
  /** Stable across camera moves while the membership holds, so `@for` can track it. */
  readonly key: string;
  readonly members: readonly PlacedPin[];
}

/**
 * The finger. Two pin centres closer than this cannot both be pressed, whatever their size — which
 * is the whole defect: at the opening zoom that is 6.8 km of coastline (issue #1134's table).
 */
export const CROWD_PX = 44;

/**
 * The existing map-chrome disc, lifted verbatim from `VENUE_PIN_CLASSES` so a prototype pin is
 * indistinguishable from a production one and every variant is judged on what it ADDS. Shared
 * across the three the way a real shared `<Header>` would be — the skin is the app's, not a
 * variant's. Theme-invariant on purpose: it sits on imagery, which never themes.
 */
export const MAP_CHROME_DISC =
  'inline-flex size-11 touch-manipulation items-center justify-center rounded-full ' +
  'border-2 border-riv-solid-btn-border bg-riv-solid-btn-fill text-[20px] leading-none ' +
  'text-riv-solid-btn-ink shadow-[0_6px_18px_rgba(7,42,58,0.35)] ' +
  'aria-expanded:bg-riv-solid-btn-ink aria-expanded:text-riv-solid-btn-fill';

/**
 * Group pins by where they currently land. Single pass in feed order, each pin joining the first
 * open cluster whose anchor is within `CROWD_PX` — deterministic, and stable while the camera
 * holds still, which is what lets a rendered pin keep its DOM element across a move.
 */
export function clusterPins(
  pins: readonly PrototypePin[],
  project: (at: LngLat) => ScreenPoint,
): readonly PinCluster[] {
  const groups: { anchor: ScreenPoint; members: PlacedPin[] }[] = [];
  for (const pin of pins) {
    const { x, y } = project(pin.at);
    const placed: PlacedPin = { pin, x, y };
    const home = groups.find((group) => distance(group.anchor, placed) < CROWD_PX);
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
  }));
}

/**
 * How far out a fan of `count` pins has to sit for neighbours on the ring to clear a finger. The
 * chord between adjacent pins is `2r·sin(π/n)`, so the ring grows with the crowd rather than
 * being a fixed radius that a five-venue beach would overflow.
 *
 * <p>`minimum` is the caller's, and the two callers want opposite things: a fan opened ON A PRESS
 * can afford to be generous, because it is temporary and sits over a scrim; a fan that is ALWAYS
 * on has to stay as tight as the finger allows, or the displacement out-measures the geography it
 * is drawn over.
 */
export function fanRadius(count: number, minimum: number): number {
  const needed = count < 2 ? 0 : CROWD_PX / 2 / Math.sin(Math.PI / count) + 5;
  return Math.max(minimum, needed);
}

/**
 * Where each member of a fan sits relative to its anchor. Starts straight up and runs clockwise,
 * so a pair reads as one above the other rather than as an arbitrary diagonal.
 */
export function fanOffsets(count: number, minimum: number): readonly ScreenPoint[] {
  const radius = fanRadius(count, minimum);
  return Array.from({ length: count }, (_unused, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
}

function distance(a: ScreenPoint, b: ScreenPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroid(points: readonly ScreenPoint[]): ScreenPoint {
  const sum = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / points.length, y: sum.y / points.length };
}
