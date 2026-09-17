import { Component, computed, input, output } from '@angular/core';

import { MapView, ScreenPoint } from '../../../shared/map-engine';
import { formatMoney } from '../../../shared/money';
import { TouchTarget } from '../../../shared/touch-target';
import {
  CROWD_PX,
  MAP_CHROME_DISC,
  PinCluster,
  pinFaceClass,
  pinFaceText,
  PlacedPin,
  textWidth,
} from './pin-crowding';

/** What pressing a place asks the page for: the camera, and the beach the list should narrow to. */
export interface PlaceTravel {
  readonly view: MapView;
  /** The one beach every member is on, or `null` when the crowd spans several. */
  readonly beach: string | null;
}

/** A place that cannot separate further opens its first venue; the list narrows to the beach. */
export interface PlaceLanding {
  readonly first: string;
  readonly beach: string | null;
}

/** Where a crowd's stepper stands: the preview card's "k of n here" and its two neighbours. */
export interface CrowdStack {
  readonly index: number;
  readonly count: number;
  readonly place: string;
  readonly prevId: string;
  readonly nextId: string;
}

/** Which way the pill hangs off its point when it cannot sit centred on it. */
type Anchor = 'centre' | 'right' | 'left';

/** One crowd's pill: what it says and what its press does. */
interface Place {
  readonly cluster: PinCluster;
  readonly name: string;
  readonly from: string | null;
  readonly beach: string | null;
  /** The camera that separates the members as far as the map and its box allow. */
  readonly view: MapView;
  /** The camera is already there: presses open the venues one by one instead. */
  readonly here: boolean;
  /** The member whose preview is open, while one is. */
  readonly current: PlacedPin | null;
  readonly index: number;
  /** The member a press opens once the place is here: the open one's successor, or the first. */
  readonly next: PlacedPin;
  readonly anchor: Anchor;
  /** No placement fit, so the pill shows the count alone. */
  readonly compact: boolean;
  readonly width: number;
}

/**
 * One member's button, and what it shows: production's priced pin for a venue on its own, the
 * place pill when it is the crowd's face, an invisible disc for the rest of a crowd.
 */
interface Slot {
  readonly member: PlacedPin;
  readonly place: Place;
  readonly position: number;
  readonly kind: 'lone' | 'place' | 'member';
}

/** Clear water two separated pins keep between them after a fit, so a hand can tell them apart. */
const SEPARATION_GAP_PX = 12;
/** Room the fitted crowd keeps from the box's edges, so no pill lands under the map's chrome. */
const FIT_MARGIN_PX = 150;
/** Closer than this to the crowd's own zoom, a press would not visibly move the camera. */
const SAME_ZOOM = 0.05;
/** How far a hung pill overlaps its point: the point sits under the pill's near end. */
const HANG_PX = 22;
/** The pill's chrome beyond its text: padding, the count disc and the gap to it, borders. */
const PILL_CHROME_PX = 13 + 8 + 26 + 6 + 4;
const NAME_FONT = '600 12.5px';
const FROM_FONT = '800 11px';

const LONE_CLASSES = `pointer-events-auto absolute ${MAP_CHROME_DISC}`;

const PLACE_CLASSES =
  'group pointer-events-auto absolute inline-flex h-11 touch-manipulation items-center gap-[6px] ' +
  'rounded-full border-2 border-riv-solid-btn-border bg-riv-solid-btn-fill pr-[6px] text-left ' +
  'text-riv-solid-btn-ink shadow-[0_6px_18px_rgba(7,42,58,0.35)] hover:bg-riv-solid-btn-hover ' +
  'motion-safe:[transition:background-color_0.15s_ease,color_0.15s_ease] ' +
  'data-here:border-riv-solid-btn-fill data-here:bg-riv-solid-btn-ink data-here:text-riv-solid-btn-fill';

const MEMBER_CLASSES =
  'pointer-events-none absolute inline-flex size-11 items-center justify-center rounded-full ' +
  'border-2 border-riv-solid-btn-fill bg-riv-solid-btn-ink text-[13px] leading-none font-bold ' +
  'text-riv-solid-btn-fill opacity-0 inset-ring-2 inset-ring-riv-solid-btn-fill/25 ' +
  'focus-visible:z-[2] focus-visible:opacity-100';

const TRANSLATE: Record<Anchor, string> = {
  centre: '-50% -50%',
  right: `${-HANG_PX}px -50%`,
  left: `calc(-100% + ${HANG_PX}px) -50%`,
};

/**
 * THROWAWAY PROTOTYPE — the hybrid, **Place pill: press a place to go there; where there is nowhere
 * closer, press through its venues**.
 *
 * <p>A crowd on this map is a place — at the opening view a beach, at beach scale a strip of sand —
 * and the tourist's first decision is which place, not which venue. So the crowd's pin says the
 * place: one pill, the priced pin's own shape grown a name and a count, reading the beach, the
 * crowd's from-price, and how many are there. Pressing it does what a tourist does with a place:
 * goes there. The camera eases to the smallest zoom that separates the members, and the Beach
 * filter follows, so the list beside the map becomes that beach's venues. Where the members
 * separate, they are then ordinary priced pins.
 *
 * <p>Where no zoom separates them, the pill inverts — the camera is here — and its press opens the
 * first venue's preview at once, the same card a lone pin opens: the pill becomes that venue's,
 * reading its name, its price and `1/3`. Pressing again walks to the next venue at the spot, and
 * the card carries a stepper doing the same. The map never leaves the screen.
 *
 * <p>Pills sit centred on their place; one that would run over another pill, a lone pin or the
 * box's edge hangs off its point to the right, then the left, and only then shows its count alone.
 *
 * <p>Keyboard parity: a crowd stays n real buttons in feed order, keyed by pin. The pill is the
 * face member's button; the others are invisible at the same spot until focused, when each paints
 * as a disc naming its venue, and each opens that venue's preview directly. One element per member
 * whatever it currently shows, so a press that changes its kind keeps focus.
 */
@Component({
  selector: 'app-variant-place-pill',
  imports: [TouchTarget],
  host: { class: 'contents' },
  template: `
    @for (slot of slots(); track slot.member.pin.id) {
      <button
        type="button"
        appTouchTarget
        [class]="slotClass(slot)"
        [style.left.px]="slot.place.cluster.x"
        [style.top.px]="slot.place.cluster.y"
        [style.translate]="slot.kind === 'place' ? translate[slot.place.anchor] : translate.centre"
        [attr.data-here]="slot.kind === 'place' && slot.place.here ? '' : null"
        [attr.aria-label]="label(slot)"
        [attr.aria-expanded]="expanded(slot)"
        (click)="press(slot)"
      >
        @switch (slot.kind) {
          @case ('lone') {
            <span aria-hidden="true" [class]="face(slot.member)">{{ faceText(slot.member) }}</span>
          }
          @case ('place') {
            @if (!slot.place.compact) {
              <span class="flex flex-col whitespace-nowrap" aria-hidden="true">
                <span class="text-[12.5px] leading-[14px] font-semibold">{{
                  title(slot.place)
                }}</span>
                @if (subtitle(slot.place); as line) {
                  <span
                    class="text-[11px] leading-[13px] tabular-nums"
                    [class]="
                      slot.place.here && !slot.place.current
                        ? 'font-semibold opacity-80'
                        : 'font-extrabold'
                    "
                    >{{ line }}</span
                  >
                }
              </span>
            }
            <span
              class="inline-flex h-[26px] min-w-[26px] shrink-0 items-center justify-center rounded-full bg-riv-solid-btn-ink px-[7px] text-[12.5px] leading-none font-bold text-riv-solid-btn-fill tabular-nums group-data-here:bg-riv-solid-btn-fill group-data-here:text-riv-solid-btn-ink"
              aria-hidden="true"
            >
              @if (slot.place.current) {
                {{ slot.place.index + 1 }}<span class="opacity-55">/</span
                >{{ slot.place.cluster.members.length }}
              } @else {
                {{ slot.place.cluster.members.length }}
              }
            </span>
          }
          @default {
            <span aria-hidden="true">{{ slot.position }}</span>
          }
        }
      </button>
    }
  `,
})
export class VariantPlacePill {
  readonly clusters = input.required<readonly PinCluster[]>();
  readonly selected = input<string | null>(null);
  /** The map box's size: a fit keeps the members inside it, and a pill that would leave it hangs. */
  readonly bounds = input<ScreenPoint>({ x: Infinity, y: Infinity });
  /** The camera's zoom now, re-read on every move, and the map's own ceiling. */
  readonly zoom = input.required<number>();
  readonly maxZoom = input.required<number>();

  readonly chosen = output<string>();
  readonly travelled = output<PlaceTravel>();
  readonly landed = output<PlaceLanding>();

  protected readonly translate = TRANSLATE;

  /**
   * The stepper the preview card shows while a crowd member is open, or `null` for a lone pin —
   * the host hands it up to the page, which owns the card.
   */
  readonly stack = computed<CrowdStack | null>(() => {
    const open = this.selected();
    const place = this.places().find((candidate) => candidate.current?.pin.id === open);
    if (!place) {
      return null;
    }
    const { members } = place.cluster;
    const count = members.length;
    return {
      index: place.index,
      count,
      place: place.name,
      prevId: members[(place.index - 1 + count) % count].pin.id,
      nextId: members[(place.index + 1) % count].pin.id,
    };
  });

  /**
   * Every member's button in feed order, keyed by the pin — never by the crowd — so a camera move
   * that re-groups a crowd keeps each element, and the focus it holds, in place.
   */
  protected readonly slots = computed<readonly Slot[]>(() =>
    this.places().flatMap((place) =>
      place.cluster.members.map((member, at) => ({
        member,
        place,
        position: at + 1,
        kind: place.cluster.members.length === 1 ? 'lone' : faceKind(place, member),
      })),
    ),
  );

  private readonly places = computed<readonly Place[]>(() => {
    const zoom = this.zoom();
    const maxZoom = this.maxZoom();
    const bounds = this.bounds();
    const open = this.selected();
    const ordered = [...this.clusters()].sort((a, b) => b.members.length - a.members.length);
    const taken: Box[] = ordered
      .filter((c) => c.members.length === 1)
      .map((c) => boxAround(c, c.width, 'centre'));
    const placed = new Map<string, Place>();
    for (const cluster of ordered) {
      const [first] = cluster.members;
      if (cluster.members.length === 1) {
        placed.set(cluster.key, {
          cluster,
          name: first.pin.card.name,
          from: null,
          beach: first.pin.card.beach,
          view: { center: centre(cluster), zoom },
          here: true,
          current: null,
          index: -1,
          next: first,
          anchor: 'centre',
          compact: false,
          width: cluster.width,
        });
        continue;
      }
      const beaches = [...new Set(cluster.members.map((member) => member.pin.card.beach))];
      const name = placeName(beaches);
      const prices = cluster.members.flatMap((m) =>
        m.pin.fromMinor === null ? [] : [m.pin.fromMinor],
      );
      const from = prices.length
        ? formatMoney({ minorUnits: Math.min(...prices), currency: 'EUR' })
        : null;
      const target = separationZoom(cluster, zoom, maxZoom, bounds);
      const here = target - zoom < SAME_ZOOM;
      const index = cluster.members.findIndex((member) => member.pin.id === open);
      const current = here && index >= 0 ? cluster.members[index] : null;
      const next = cluster.members[(index + 1) % cluster.members.length];
      const draft: Omit<Place, 'anchor' | 'compact' | 'width'> = {
        cluster,
        name,
        from,
        beach: beaches.length === 1 ? beaches[0] : null,
        view: { center: centre(cluster), zoom: target },
        here,
        current,
        index,
        next,
      };
      const text = Math.max(
        textWidth(titleOf(draft), NAME_FONT),
        textWidth(subtitleOf(draft) ?? '', FROM_FONT),
      );
      const full = Math.ceil(text + PILL_CHROME_PX);
      const fits = (['centre', 'right', 'left'] as const).find((anchor) => {
        const box = boxAround(cluster, full, anchor);
        return inside(box, bounds) && !taken.some((other) => intersects(box, other));
      });
      const anchor = fits ?? 'centre';
      const width = fits ? full : CROWD_PX;
      taken.push(boxAround(cluster, width, anchor));
      placed.set(cluster.key, { ...draft, anchor, compact: !fits, width });
    }
    return this.clusters().map((cluster) => placed.get(cluster.key)!);
  });

  protected press({ kind, place, member }: Slot): void {
    if (kind !== 'place') {
      this.chosen.emit(member.pin.id);
    } else if (!place.here) {
      this.travelled.emit({ view: place.view, beach: place.beach });
    } else if (place.current) {
      this.chosen.emit(place.next.pin.id);
    } else {
      this.landed.emit({ first: place.next.pin.id, beach: place.beach });
    }
  }

  protected slotClass(slot: Slot): string {
    switch (slot.kind) {
      case 'lone':
        return LONE_CLASSES;
      case 'place':
        return `${PLACE_CLASSES} ${slot.place.compact ? 'pl-[6px]' : 'pl-[13px]'}`;
      default:
        return MEMBER_CLASSES;
    }
  }

  protected expanded(slot: Slot): boolean | null {
    switch (slot.kind) {
      case 'lone':
        return this.selected() === slot.member.pin.id;
      case 'place':
        return slot.place.current !== null;
      default:
        return null;
    }
  }

  protected title(place: Place): string {
    return titleOf(place);
  }

  protected subtitle(place: Place): string | null {
    return subtitleOf(place);
  }

  protected label(slot: Slot): string {
    switch (slot.kind) {
      case 'lone':
        return this.loneLabel(slot.member);
      case 'place':
        return this.placeLabel(slot.place);
      default:
        return this.memberLabel(slot);
    }
  }

  private placeLabel(place: Place): string {
    const count = `${place.cluster.members.length} venues at ${place.name}`;
    const from = place.from ? `, from ${place.from}` : '';
    if (!place.here) {
      return `${count}${from}; press to zoom to them`;
    }
    if (place.current) {
      return `${place.current.pin.card.name}, ${place.index + 1} of ${count}; press again for ${place.next.pin.card.name}`;
    }
    return `${count}${from}; press to open ${place.next.pin.card.name}`;
  }

  private loneLabel(member: PlacedPin): string {
    const { name, beach, priceLabel } = member.pin.card;
    return priceLabel ? `${name}, ${beach}, from ${priceLabel}` : `${name}, ${beach}`;
  }

  private memberLabel({ member, place, position }: Slot): string {
    return `${member.pin.card.name}, ${position} of ${place.cluster.members.length} venues at ${place.name}`;
  }

  protected face(member: PlacedPin): string {
    return pinFaceClass(member.pin);
  }

  protected faceText(member: PlacedPin): string {
    return pinFaceText(member.pin);
  }
}

/** The crowd's face is the open member while one is open, else the first — the pill is its button. */
function faceKind(place: Place, member: PlacedPin): 'place' | 'member' {
  const face = place.current ?? place.cluster.members[0];
  return member === face ? 'place' : 'member';
}

function titleOf(place: Pick<Place, 'name' | 'current'>): string {
  return place.current ? place.current.pin.card.name : place.name;
}

/** Under the name: the from-price, or once the camera is here, what a press now does. */
function subtitleOf(place: Pick<Place, 'from' | 'here' | 'current'>): string | null {
  if (place.current) {
    const price = place.current.pin.card.priceLabel;
    return price ? `from ${price}` : null;
  }
  if (place.here) {
    return 'See each venue';
  }
  return place.from ? `from ${place.from}` : null;
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function boxAround(at: ScreenPoint, width: number, anchor: Anchor): Box {
  const left =
    anchor === 'centre'
      ? at.x - width / 2
      : anchor === 'right'
        ? at.x - HANG_PX
        : at.x + HANG_PX - width;
  return { left, top: at.y - CROWD_PX / 2, right: left + width, bottom: at.y + CROWD_PX / 2 };
}

function inside(box: Box, bounds: ScreenPoint): boolean {
  return box.left >= 0 && box.top >= 0 && box.right <= bounds.x && box.bottom <= bounds.y;
}

function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** The beach when the crowd agrees on one, both when it spans two, a count beyond that. */
function placeName(beaches: readonly string[]): string {
  if (beaches.length === 1) {
    return beaches[0];
  }
  return beaches.length === 2 ? `${beaches[0]} & ${beaches[1]}` : `${beaches.length} beaches`;
}

/** The members' mean position — a crowd is at most a few km across, so the mean is its middle. */
function centre(cluster: PinCluster): { lng: number; lat: number } {
  const n = cluster.members.length;
  return {
    lng: cluster.members.reduce((sum, m) => sum + m.pin.at.lng, 0) / n,
    lat: cluster.members.reduce((sum, m) => sum + m.pin.at.lat, 0) / n,
  };
}

/**
 * The smallest zoom at which no two members bury each other, with a little water between them —
 * Web Mercator scales every screen offset by `2^(Δzoom)`, so each pair names the zoom it needs and
 * the crowd needs the largest. Capped by the map's ceiling and by the box: a crowd that would spill
 * past the edges stops where it just fits, and separates as far as that allows.
 */
function separationZoom(
  cluster: PinCluster,
  zoom: number,
  maxZoom: number,
  bounds: ScreenPoint,
): number {
  let needed = zoom;
  const members = cluster.members;
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const a = members[i];
      const b = members[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const across = ((a.width + b.width) / 2 + SEPARATION_GAP_PX) / dx;
      const down = (CROWD_PX + SEPARATION_GAP_PX) / dy;
      const scale = Math.min(across, down);
      if (Number.isFinite(scale)) {
        needed = Math.max(needed, zoom + Math.log2(scale));
      } else {
        needed = maxZoom;
      }
    }
  }
  const xs = members.map((m) => m.x);
  const ys = members.map((m) => m.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const room = Math.min(
    spanX > 0 ? (bounds.x - FIT_MARGIN_PX) / spanX : Infinity,
    spanY > 0 ? (bounds.y - FIT_MARGIN_PX) / spanY : Infinity,
  );
  const fits = Number.isFinite(room) ? zoom + Math.log2(room) : maxZoom;
  return Math.max(zoom, Math.min(needed, fits, maxZoom));
}
