import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { beachLabel } from '../../shared/beaches';
import { DotIcon } from '../../shared/dot-icon';
import { MapHandle } from '../../shared/map-engine';
import { TouchTarget } from '../../shared/touch-target';
import {
  anchorLeft,
  crowdCentre,
  crowdPins,
  CrowdStack,
  HANG_PX,
  layoutPills,
  lowestFromPrice,
  MapBox,
  PIN_HEIGHT_PX,
  PinCrowd,
  PillPlacement,
  PillSpace,
  PlacedPin,
  placeName,
  Rect,
  riseOffset,
  separationZoom,
  textWidth,
  VenuePin,
} from './pin-crowding';

/** One crowd's pill: what it says, and what its press does. */
interface Place {
  readonly crowd: PinCrowd;
  readonly name: string;
  readonly from: string | null;
  /** The one beach (its catalogue code) every member is on, or `null` when the crowd spans several. */
  readonly beach: string | null;
  /** The zoom that separates the members as far as the map and its box allow. */
  readonly zoom: number;
  /** The camera is already there: presses open the venues one by one instead. */
  readonly here: boolean;
  /** The member whose preview is open, while the camera is here and one is. */
  readonly current: PlacedPin | null;
  readonly index: number;
  /** The member a press opens once the place is here: the open one's successor, or the first. */
  readonly next: PlacedPin;
  /** Every member's sales for the chosen day have closed: the face greys, the price is struck. */
  readonly dusk: boolean;
  readonly placement: PillPlacement;
}

/**
 * One venue's button, and what it shows: production's priced pin for a venue on its own, the
 * place pill when it is the crowd's face, an invisible disc for the rest of a crowd.
 */
interface Slot {
  readonly member: PlacedPin;
  readonly place: Place;
  readonly position: number;
  readonly kind: 'lone' | 'place' | 'member';
}

/** Closer than this to the crowd's own zoom, a press would not visibly move the camera. */
const SAME_ZOOM = 0.05;
/** The pill's chrome beyond its text: `pl-[13px]` + `pr-[6px]`, the 26 px count disc, its 6 px gap, two 2 px borders. */
const PILL_CHROME_PX = 13 + 6 + 26 + 6 + 4;
const NAME_FONT = { weight: 600, sizePx: 12.5 };
const FROM_FONT = { weight: 800, sizePx: 11 };

/**
 * The lone venue's pin: the theme-invariant solid-button skin the rest of the map chrome wears,
 * as a real control — it opens something, so it is a `<button>` and takes the focus ring. 44 px
 * tall and at least 44 px wide (WCAG 2.5.5 on both axes), growing with the price written on it.
 * The selected pin INVERTS the same fixed pair rather than reaching for the accent: it sits on
 * imagery, which never themes, so a theme-switching fill under a fixed ink would drift.
 */
const LONE_CLASSES =
  'pointer-events-auto absolute inline-flex h-11 min-w-11 touch-manipulation items-center ' +
  'justify-center rounded-full border-2 border-riv-solid-btn-border bg-riv-solid-btn-fill ' +
  'leading-none text-riv-solid-btn-ink shadow-[0_6px_18px_rgba(7,42,58,0.35)] ' +
  'aria-expanded:bg-riv-solid-btn-ink aria-expanded:text-riv-solid-btn-fill';

/** The dot a pin with no price shows: `DotIcon`'s disc is two thirds of its box, so 14 px across. */
const LONE_DOT_CLASSES = '[&_svg]:size-[21px]';

/**
 * Dusk: this venue, or every venue in this crowd, has stopped selling for the chosen day
 * (invariant #4, rendered). Desaturation over the fixed hover fill with the price struck, and the
 * ink untouched — a faded button would drop the face under AA over imagery of unknown luminance,
 * and the strike keeps the state off colour alone. The `data-dusk:` fill outranks the resting one
 * by specificity, not by class order.
 */
const DUSK_CLASSES =
  'data-dusk:saturate-0 data-dusk:bg-riv-solid-btn-hover ' +
  'data-dusk:[&_.pin-price]:line-through';

/**
 * The priced face: the card price's weight, tabular so `€25` and `€30` sit the same width side by
 * side, and never wrapped — a pin that grew a second line would drop below the floor.
 */
const LONE_BADGE_CLASSES = 'px-[12px] text-[14px] font-extrabold tabular-nums whitespace-nowrap';

/**
 * The place pill: the priced pin's own shape grown a name and a count, in the same fixed pair.
 * `data-here` inverts it — the camera has nowhere closer to go — exactly as selection inverts a
 * lone pin.
 */
const PLACE_CLASSES =
  'group pointer-events-auto absolute inline-flex h-11 touch-manipulation items-center gap-[6px] ' +
  'rounded-full border-2 border-riv-solid-btn-border bg-riv-solid-btn-fill pr-[6px] text-left ' +
  'text-riv-solid-btn-ink shadow-[0_6px_18px_rgba(7,42,58,0.35)] hover:bg-riv-solid-btn-hover ' +
  'motion-safe:[transition:background-color_0.15s_ease,color_0.15s_ease] ' +
  'data-here:border-riv-solid-btn-fill data-here:bg-riv-solid-btn-ink data-here:text-riv-solid-btn-fill';

/** The list answering the map: the same fill a pointer over the pin itself would give it. */
const HOVER_CLASSES = 'data-hover:bg-riv-solid-btn-hover';

/**
 * The rest of a crowd: real 44 px buttons at the crowd's spot, invisible until focused, when each
 * paints as an inverted disc numbering its venue. Pointer presses go to the pill; these exist for
 * the keyboard, which walks every venue exactly as it did when each had a pin of its own.
 */
const MEMBER_CLASSES =
  'pointer-events-none absolute inline-flex size-11 items-center justify-center rounded-full ' +
  'border-2 border-riv-solid-btn-fill bg-riv-solid-btn-ink text-[13px] leading-none font-bold ' +
  'text-riv-solid-btn-fill opacity-0 focus-visible:z-[2] focus-visible:opacity-100';

/**
 * The riviera map's venue pins, drawn as an ordinary Angular overlay in light DOM over the map's
 * box rather than as markers the engine holds: every pin is re-projected through the map port on
 * each camera move, and `@for … track` keeps one element per venue across every re-group, so the
 * focus a button holds survives a fit, a re-group and a narrowing of the list.
 *
 * <p>A venue on its own is production's priced pin. Venues whose pins would bury each other at the
 * current camera form a **crowd**, drawn as one **place pill** — the beach, the crowd's lowest
 * from-price and the count — whose press eases the camera to the smallest zoom that separates
 * them and, when they share one beach, reports it so the page can narrow the list. Where no zoom
 * separates them the pill inverts and its presses walk the crowd's previews one by one.
 *
 * <p>Keyboard parity: a crowd stays n real buttons in feed order, keyed by pin — the pill is the
 * face member's button (the open one while a preview is open, else the first) and the others are
 * invisible at the same spot until focused, each opening its own venue. The host passes pointer
 * events through to the map; only the buttons re-arm them. Vocabulary: `CONTEXT.md`.
 */
@Component({
  selector: 'app-venue-pin-layer',
  imports: [DotIcon, TouchTarget],
  host: {
    class: 'pointer-events-none absolute inset-0 z-[4] block overflow-hidden rounded-[26px]',
    'data-touch-pans': 'the map pans: a pin cut by its edge is reached whole by panning',
  },
  templateUrl: './venue-pin-layer.html',
})
export class VenuePinLayer {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  /** The venues to draw, in the order a keyboard should walk them — the list's own. */
  readonly pins = input.required<readonly VenuePin[]>();
  /** The live map the pins are projected through; nothing is drawn until it has booted. */
  readonly map = input<MapHandle | undefined>(undefined);
  /** Which venue is currently showing its preview, or `null` for none. */
  readonly selected = input<string | null>(null);
  /**
   * The venue whose row the pointer (or the keyboard) is on, so the map answers the list: the
   * pin lights exactly as a pointer over the pin itself lights it. A crowd's pill lights for any
   * of its members, since the pill is the only thing drawn for them.
   */
  readonly highlighted = input<string | null>(null);
  /** The map's own zoom ceiling: a crowd that needs more than this is one the camera cannot separate. */
  readonly maxZoom = input.required<number>();
  /**
   * Boxes no pill may sit on — the page's chrome over the map and the tourist's own dot, the dot
   * already carrying its margin — in VIEWPORT coordinates, as the host measured them.
   */
  readonly noGo = input<readonly Rect[]>([]);
  /**
   * Where a pill may sit, in VIEWPORT coordinates: on the phone the map the glass header and the
   * sheet leave. `null` is the layer's own box, which is every pixel it draws on.
   */
  readonly window = input<Rect | null>(null);

  /** A venue to open the preview of: a lone pin, a crowd member, or the walk's next venue. */
  readonly chosen = output<string>();
  /** The one beach a pressed place is on, for the list to narrow to. */
  readonly narrowed = output<string>();

  /** Bumped whenever the projection could have changed; the only thing the geometry recomputes on. */
  private readonly tick = signal(0);
  /** The layer's own box in the viewport once measured; `null` in a document that lays nothing out. */
  private readonly frame = signal<Rect | null>(null);
  /** The map box's size once measured; `null` in a document that lays nothing out. */
  private readonly box = computed<MapBox | null>(() => {
    const frame = this.frame();
    return frame && { width: frame.right - frame.left, height: frame.bottom - frame.top };
  });

  /**
   * The room the pills have, in the layer's own coordinates: the host measures the chrome and the
   * window where it draws them — the viewport — and the layer's own origin is what turns the two
   * spaces into one. On the phone the layer IS the viewport and the shift is zero; on the desktop
   * it is the pane, inset from both.
   */
  private readonly space = computed<PillSpace>(() => {
    const frame = this.frame();
    const shift = (rect: Rect): Rect => ({
      left: rect.left - (frame?.left ?? 0),
      top: rect.top - (frame?.top ?? 0),
      right: rect.right - (frame?.left ?? 0),
      bottom: rect.bottom - (frame?.top ?? 0),
    });
    const asked = this.window();
    return {
      window: asked ? shift(asked) : frame && shift(frame),
      noGo: this.noGo().map(shift),
    };
  });

  private readonly crowds = computed(() => {
    const map = this.map();
    this.tick();
    return map ? crowdPins(this.pins(), (at) => map.project(at)) : [];
  });

  private readonly zoom = computed(() => {
    this.tick();
    return this.map()?.view().zoom ?? 0;
  });

  private readonly places = computed<readonly Place[]>(() => {
    const zoom = this.zoom();
    const maxZoom = this.maxZoom();
    const box = this.box();
    const open = this.selected();
    const drafts = new Map(
      this.crowds().map((crowd) => [crowd.key, this.describe(crowd, zoom, maxZoom, box, open)]),
    );
    const placements = layoutPills(
      this.crowds(),
      (crowd) => pillWidth(drafts.get(crowd.key)!),
      this.space(),
    );
    return this.crowds().map((crowd) => ({
      ...drafts.get(crowd.key)!,
      placement: placements.get(crowd.key)!,
    }));
  });

  /**
   * The open venue's place in its inseparable crowd, for the preview card's stepper; `null` while
   * nothing is open, or the open venue is on its own or in a crowd the camera can still separate.
   */
  readonly stack = computed<CrowdStack | null>(() => {
    const place = this.places().find((candidate) => candidate.current !== null);
    if (!place) {
      return null;
    }
    const { members } = place.crowd;
    const count = members.length;
    return {
      index: place.index,
      count,
      place: place.name,
      prevId: members[(place.index - 1 + count) % count].pin.id,
      nextId: place.next.pin.id,
    };
  });

  /**
   * Every lone pin's box in VIEWPORT coordinates: the pins the layout never moves. A host whose
   * own chrome shares this box reads them to decide where that chrome goes, since between a lone
   * pin and a control it is the control that moves.
   */
  readonly loneBoxes = computed<readonly Rect[]>(() => {
    const frame = this.frame();
    return this.crowds()
      .filter((crowd) => crowd.members.length === 1)
      .map((crowd) => ({
        left: (frame?.left ?? 0) + crowd.x - crowd.width / 2,
        top: (frame?.top ?? 0) + crowd.y - PIN_HEIGHT_PX / 2,
        right: (frame?.left ?? 0) + crowd.x + crowd.width / 2,
        bottom: (frame?.top ?? 0) + crowd.y + PIN_HEIGHT_PX / 2,
      }));
  });

  /** Every venue's button in feed order, keyed by the pin — never by the crowd. */
  protected readonly slots = computed<readonly Slot[]>(() =>
    this.places().flatMap((place) =>
      place.crowd.members.map((member, at) => ({
        member,
        place,
        position: at + 1,
        kind: place.crowd.members.length === 1 ? 'lone' : faceKind(place, member),
      })),
    ),
  );

  constructor() {
    effect((onCleanup) => {
      const map = this.map();
      if (map) {
        onCleanup(map.onMove(() => this.bump()));
      }
    });
    afterNextRender(() => this.watchSize());
  }

  /**
   * Put focus on a venue's button, whatever face it currently wears. A consumer closing the
   * preview a pin opened calls this to hand focus back (WCAG 2.4.3); a venue the layer does not
   * draw is a no-op — a list that moved under the viewer is exactly when that is asked for.
   */
  focusPin(id: string): void {
    this.host.nativeElement.querySelector<HTMLElement>(`[data-pin="${CSS.escape(id)}"]`)?.focus();
  }

  protected press({ kind, place, member }: Slot): void {
    if (kind !== 'place') {
      this.chosen.emit(member.pin.id);
    } else if (!place.here) {
      this.map()?.easeTo({ center: crowdCentre(place.crowd), zoom: place.zoom });
      this.narrow(place);
    } else if (place.current) {
      this.chosen.emit(place.next.pin.id);
    } else {
      this.narrow(place);
      this.chosen.emit(place.next.pin.id);
    }
  }

  protected testId({ kind }: Slot): string {
    switch (kind) {
      case 'lone':
        return 'map-venue-pin';
      case 'place':
        return 'map-place-pill';
      default:
        return 'map-crowd-member';
    }
  }

  protected slotClass(slot: Slot): string {
    switch (slot.kind) {
      case 'lone':
        return `${LONE_CLASSES} ${DUSK_CLASSES} ${HOVER_CLASSES} ${slot.member.pin.card.priceLabel ? LONE_BADGE_CLASSES : LONE_DOT_CLASSES}`;
      case 'place':
        return `${PLACE_CLASSES} ${DUSK_CLASSES} ${HOVER_CLASSES} ${slot.place.placement.compact ? 'pl-[6px]' : 'pl-[13px]'}`;
      default:
        return MEMBER_CLASSES;
    }
  }

  /**
   * Whether this face is at dusk. A lone pin answers for itself; a crowd's pill answers for the
   * whole crowd, so `Borsh · 2` greys at 16:30 while `3 beaches · 6` keeps its colour with four of
   * six still selling. The invisible member discs never grey: nothing of them is painted.
   */
  protected dusk({ kind, place, member }: Slot): boolean {
    return kind === 'lone' ? member.pin.card.salesClosed : kind === 'place' && place.dusk;
  }

  /** The face drawn for the highlighted venue: its own pin, or the pill its crowd is drawn as. */
  protected lit({ kind, place }: Slot): boolean {
    const id = this.highlighted();
    return (
      id !== null && kind !== 'member' && place.crowd.members.some((member) => member.pin.id === id)
    );
  }

  /** The pill hangs off its point when it cannot sit centred; every other face sits centred. */
  protected translate({ kind, place }: Slot): string {
    if (kind !== 'place' || place.placement.anchor === 'centre') {
      return '-50% -50%';
    }
    return `${anchorLeft(0, place.placement.width, place.placement.anchor)}px -50%`;
  }

  /**
   * Down the screen: the crowd's own point, and for a pill hung clear of it, that point moved. The
   * rise rides the button's `top` rather than a `calc()` inside its translate, so the hang is a
   * number both a spec and a screenshot can read off the element.
   */
  protected top({ kind, place }: Slot): number {
    return place.crowd.y + (kind === 'place' ? riseOffset(place.placement.rise) : 0);
  }

  protected expanded(slot: Slot): boolean {
    return slot.kind === 'place'
      ? slot.place.current !== null
      : this.selected() === slot.member.pin.id;
  }

  protected label(slot: Slot): string {
    switch (slot.kind) {
      case 'lone':
        return loneLabel(slot.member);
      case 'place':
        return placeLabel(slot.place);
      default:
        return `${slot.member.pin.card.name}, ${slot.position} of ${slot.place.crowd.members.length} venues at ${slot.place.name}`;
    }
  }

  protected title(place: Place): string {
    return titleOf(place);
  }

  protected subtitle(place: Place): string | null {
    return subtitleOf(place);
  }

  private describe(
    crowd: PinCrowd,
    zoom: number,
    maxZoom: number,
    box: MapBox | null,
    open: string | null,
  ): Omit<Place, 'placement'> {
    const beaches = [...new Set(crowd.members.map((member) => member.pin.card.beach))];
    const target = separationZoom(crowd, zoom, maxZoom, box);
    const here = crowd.members.length > 1 && target - zoom < SAME_ZOOM;
    const index = crowd.members.findIndex((member) => member.pin.id === open);
    return {
      crowd,
      dusk: crowd.members.every((member) => member.pin.card.salesClosed),
      name: placeName(beaches.map(beachLabel)),
      from: lowestFromPrice(crowd.members.map((member) => member.pin.card)),
      beach: beaches.length === 1 ? beaches[0] : null,
      zoom: target,
      here,
      current: here && index >= 0 ? crowd.members[index] : null,
      index,
      next: crowd.members[(index + 1) % crowd.members.length],
    };
  }

  private narrow(place: Place): void {
    if (place.beach !== null) {
      this.narrowed.emit(place.beach);
    }
  }

  /** A resized map re-projects every pin, and no engine reports that as a camera move. */
  private watchSize(): void {
    if (typeof ResizeObserver !== 'function') {
      return;
    }
    const observer = new ResizeObserver(() => {
      const { left, top, right, bottom } = this.host.nativeElement.getBoundingClientRect();
      this.frame.set({ left, top, right, bottom });
      this.bump();
    });
    observer.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private bump(): void {
    this.tick.update((value) => value + 1);
  }
}

/** The crowd's face is the open member while one is open, else the first — the pill is its button. */
function faceKind(place: Place, member: PlacedPin): 'place' | 'member' {
  return member === (place.current ?? place.crowd.members[0]) ? 'place' : 'member';
}

function loneLabel(member: PlacedPin): string {
  const { name, priceLabel } = member.pin.card;
  return priceLabel ? `${name}, from ${priceLabel}` : name;
}

function placeLabel(place: Place): string {
  const count = `${place.crowd.members.length} venues at ${place.name}`;
  const from = place.from ? `, from ${place.from}` : '';
  if (!place.here) {
    return `${count}${from}; press to zoom to them`;
  }
  if (place.current) {
    return `${place.current.pin.card.name}, ${place.index + 1} of ${count}; press again for ${place.next.pin.card.name}`;
  }
  return `${count}${from}; press to open ${place.next.pin.card.name}`;
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
  return place.here ? 'See each venue' : place.from && `from ${place.from}`;
}

/** The pill at full width: its longer line plus its chrome; a lone pin is as wide as its face. */
function pillWidth(place: Omit<Place, 'placement'>): number {
  if (place.crowd.members.length === 1) {
    return place.crowd.width;
  }
  const text = Math.max(
    textWidth(titleOf(place), NAME_FONT),
    textWidth(subtitleOf(place) ?? '', FROM_FONT),
  );
  return Math.max(PIN_HEIGHT_PX + HANG_PX, Math.ceil(text + PILL_CHROME_PX));
}
