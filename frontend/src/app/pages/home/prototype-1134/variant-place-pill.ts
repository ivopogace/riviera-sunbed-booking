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

/** A place that cannot separate further hands the choice to the list, starting at this venue. */
export interface PlaceList {
  readonly first: string;
  /** The one beach every member is on, or `null` when the crowd spans several. */
  readonly beach: string | null;
}

/** One crowd's pill: what it says and what its press does. */
interface Place {
  readonly cluster: PinCluster;
  readonly name: string;
  readonly from: string | null;
  readonly beach: string | null;
  /** The camera that separates the members as far as the map and its box allow. */
  readonly view: MapView;
  /** The camera is already there: the press opens the list instead. */
  readonly here: boolean;
  /** The pill would run over a neighbour or the box's edge, so it shows the count alone. */
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

/** Clear water two separated pins keep between them after a fit, so a hand can tell them apart. */
const SEPARATION_GAP_PX = 12;
/** Room the fitted crowd keeps from the box's edges, so no pin lands under the map's chrome. */
const FIT_MARGIN_PX = 150;
/** Closer than this to the crowd's own zoom, a press would not visibly move the camera. */
const SAME_ZOOM = 0.05;
/** The pill's chrome beyond its text: padding, the count disc and the gap to it, borders. */
const PILL_CHROME_PX = 13 + 8 + 26 + 6 + 4;
const NAME_FONT = '600 12.5px';
const FROM_FONT = '800 11px';

/**
 * THROWAWAY PROTOTYPE — variant E, **Place pill: press a place to go there**.
 *
 * <p>A crowd on this map is a place — at the opening view a beach, at beach scale a strip of sand —
 * and the tourist's first decision is which place, not which venue. So the crowd's pin says the
 * place: one pill, the priced pin's own shape grown a name and a count, reading the beach, the
 * crowd's from-price, and how many are there. Pressing it does what a tourist does with a place:
 * goes there. The camera eases to the smallest zoom that separates the members, and the Beach
 * filter follows, so the list beside the map (the List tab on a phone) becomes that beach's
 * venues — the surface with every deciding fact, which the page already has. Where the members
 * separate, they are then ordinary priced pins. Where no zoom separates them, the pill inverts,
 * reads "Open the list", and its press hands the choice to the list.
 *
 * <p>Nothing is merged away, displaced, or opened over the map. Pills declutter biggest place
 * first: one that would run over another pill, a lone pin, or the box's edge shows its count alone.
 *
 * <p>Keyboard parity: a crowd stays n real buttons in feed order, keyed by pin. The pill is the
 * first member's button; the others are invisible at the same spot until focused, when each paints
 * as a disc naming its venue, and each opens that venue's preview directly.
 */
@Component({
  selector: 'app-variant-place-pill',
  imports: [TouchTarget],
  host: { class: 'contents' },
  template: `
    @for (slot of slots(); track slot.member.pin.id) {
      <!-- One element per member whatever it currently shows, so a press that changes its kind keeps focus. -->
      <button
        type="button"
        appTouchTarget
        [class]="slotClass(slot)"
        [style.left.px]="slot.place.cluster.x"
        [style.top.px]="slot.place.cluster.y"
        [style.translate]="'-50% -50%'"
        [attr.data-here]="slot.kind === 'place' && slot.place.here ? '' : null"
        [attr.aria-label]="label(slot)"
        [attr.aria-expanded]="slot.kind === 'lone' ? selected() === slot.member.pin.id : null"
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
                  slot.place.name
                }}</span>
                @if (slot.place.here) {
                  <span class="text-[11px] leading-[13px] font-semibold opacity-80"
                    >Open the list</span
                  >
                } @else if (slot.place.from; as from) {
                  <span class="text-[11px] leading-[13px] font-extrabold tabular-nums"
                    >from {{ from }}</span
                  >
                }
              </span>
            }
            <span
              class="inline-flex size-[26px] shrink-0 items-center justify-center rounded-full bg-riv-solid-btn-ink text-[12.5px] leading-none font-bold text-riv-solid-btn-fill tabular-nums group-data-here:bg-riv-solid-btn-fill group-data-here:text-riv-solid-btn-ink"
              aria-hidden="true"
              >{{ slot.place.cluster.members.length }}</span
            >
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
  /** The map box's size: a fit keeps the members inside it, and a pill that would leave it yields. */
  readonly bounds = input<ScreenPoint>({ x: Infinity, y: Infinity });
  /** The camera's zoom now, re-read on every move, and the map's own ceiling. */
  readonly zoom = input.required<number>();
  readonly maxZoom = input.required<number>();

  readonly chosen = output<string>();
  readonly travelled = output<PlaceTravel>();
  readonly listed = output<PlaceList>();

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
        kind: place.cluster.members.length === 1 ? 'lone' : at === 0 ? 'place' : 'member',
      })),
    ),
  );

  private readonly places = computed<readonly Place[]>(() => {
    const zoom = this.zoom();
    const maxZoom = this.maxZoom();
    const bounds = this.bounds();
    const ordered = [...this.clusters()].sort((a, b) => b.members.length - a.members.length);
    const taken: Box[] = ordered
      .filter((c) => c.members.length === 1)
      .map((c) => boxAround(c, c.width));
    const placed = new Map<string, Place>();
    for (const cluster of ordered) {
      if (cluster.members.length === 1) {
        placed.set(cluster.key, {
          cluster,
          name: cluster.members[0].pin.card.name,
          from: null,
          beach: cluster.members[0].pin.card.beach,
          view: { center: centre(cluster), zoom },
          here: true,
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
      const line = here ? 'Open the list' : from ? `from ${from}` : '';
      const text = Math.max(textWidth(name, NAME_FONT), textWidth(line, FROM_FONT));
      const full = Math.ceil(text + PILL_CHROME_PX);
      const fullBox = boxAround(cluster, full);
      const compact = !inside(fullBox, bounds) || taken.some((box) => intersects(fullBox, box));
      const width = compact ? CROWD_PX : full;
      taken.push(boxAround(cluster, width));
      placed.set(cluster.key, {
        cluster,
        name,
        from,
        beach: beaches.length === 1 ? beaches[0] : null,
        view: { center: centre(cluster), zoom: target },
        here,
        compact,
        width,
      });
    }
    return this.clusters().map((cluster) => placed.get(cluster.key)!);
  });

  protected press({ kind, place, member }: Slot): void {
    if (kind !== 'place') {
      this.chosen.emit(member.pin.id);
    } else if (place.here) {
      this.listed.emit({ first: member.pin.id, beach: place.beach });
    } else {
      this.travelled.emit({ view: place.view, beach: place.beach });
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
    return place.here
      ? `${count}${from}; press to open the list`
      : `${count}${from}; press to zoom to them`;
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

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function boxAround(at: ScreenPoint, width: number): Box {
  return {
    left: at.x - width / 2,
    top: at.y - CROWD_PX / 2,
    right: at.x + width / 2,
    bottom: at.y + CROWD_PX / 2,
  };
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
