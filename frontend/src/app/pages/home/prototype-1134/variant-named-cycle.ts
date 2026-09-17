import { Component, computed, input, output } from '@angular/core';

import { TouchTarget } from '../../../shared/touch-target';
import { ScreenPoint } from '../../../shared/map-engine';
import { CROWD_PX, MAP_CHROME_BADGE, PinCluster, PlacedPin, textWidth } from './pin-crowding';

/** The pin's tail: which way it runs from the disc, or nowhere when the space is spoken for. */
type TailSide = 'right' | 'left' | 'none';

/** One drawn chip: a cluster, the member it currently stands for, and whether it got a label. */
interface Chip {
  readonly cluster: PinCluster;
  /** The member whose button wears the chip: the open one while a preview is open, else the first. */
  readonly face: PlacedPin;
  /** The member a press opens — the open one's successor, wrapping, or the first. */
  readonly next: PlacedPin;
  /** The open member while its preview is showing, else none. */
  readonly current: PlacedPin | null;
  readonly index: number;
  readonly text: string;
  readonly tail: TailSide;
  /** The coin's width: production's priced pill for a lone venue, the 44 px count disc for a crowd. */
  readonly coin: number;
}

/** One member's button: the chip when it is the crowd's face, an invisible disc otherwise. */
interface Slot {
  readonly member: PlacedPin;
  readonly chip: Chip;
  readonly position: number;
}

/** Where a crowd's stepper stands: the preview card's "k of n here" and its two neighbours. */
export interface CrowdStack {
  readonly index: number;
  readonly count: number;
  readonly place: string;
  readonly prevId: string;
  readonly nextId: string;
}

/** The tail past the coin's edge: 8 px of tuck, 13 px of end padding. */
const TAIL_PADDING = 21;
const TAIL_TEXT_MAX = 137;
const TAIL_FONT = '600 13px';

/**
 * THROWAWAY PROTOTYPE — variant D, **Named pins, press again**.
 *
 * <p>Two axes the other three leave alone. The pin itself: never an anonymous dot, every pin is
 * a chip that says what is there — the venue's name alone, its beach with a count when several
 * share the spot — so the map informs before anyone presses. And time: pressing a crowd does not
 * open a fan or a list, it opens the first venue's preview at once, the same card a lone pin
 * opens; pressing the chip again walks to the next venue at that spot, and the card carries a
 * "k of n here" stepper doing the same. Nothing on the map moves or merges away, and nothing
 * covers the map beyond the card the page already has.
 *
 * <p>Labels declutter greedily, biggest crowd first: a tail that would run over another pin's
 * disc or an already-placed tail tries the other side, then yields to a bare counted disc. The
 * disc — the control — never moves and never yields.
 *
 * <p>Keyboard parity: a crowd stays n real buttons in feed order, exactly as production draws
 * them. The chip is the current member's button; the others are invisible at the same spot
 * until focused, when each paints as a disc naming its venue.
 */
@Component({
  selector: 'app-variant-named-cycle',
  imports: [TouchTarget],
  host: { class: 'contents' },
  template: `
    @for (slot of slots(); track slot.member.pin.id) {
      @if (slot.member.pin.id === slot.chip.face.pin.id) {
        <button
          type="button"
          appTouchTarget
          class="group pointer-events-auto absolute inline-flex h-11 touch-manipulation items-center rounded-full"
          [class.flex-row-reverse]="slot.chip.tail === 'left'"
          [style.left.px]="slot.chip.cluster.x"
          [style.top.px]="slot.chip.cluster.y"
          [style.translate]="
            slot.chip.tail === 'left'
              ? 'calc(-100% + ' + slot.chip.coin / 2 + 'px) -50%'
              : -slot.chip.coin / 2 + 'px -50%'
          "
          [attr.aria-label]="chipLabel(slot.chip)"
          [attr.aria-expanded]="slot.chip.current !== null"
          (click)="chosen.emit(slot.chip.next.pin.id)"
        >
          <!-- The coin sits exactly on the venue: a lone venue's is production's priced pill; a crowd's wears a rim, a stack's silhouette. -->
          <span
            class="relative z-[1] inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full border-2 border-riv-solid-btn-border bg-riv-solid-btn-fill text-riv-solid-btn-ink shadow-[0_6px_18px_rgba(7,42,58,0.35)] group-hover:bg-riv-solid-btn-hover group-aria-expanded:border-riv-solid-btn-fill group-aria-expanded:bg-riv-solid-btn-ink group-aria-expanded:text-riv-solid-btn-fill motion-safe:[transition:background-color_0.15s_ease,color_0.15s_ease]"
            [class]="
              slot.chip.cluster.members.length > 1
                ? 'inset-ring-2 inset-ring-riv-solid-btn-ink/16 group-aria-expanded:inset-ring-riv-solid-btn-fill/25'
                : ''
            "
            aria-hidden="true"
          >
            @if (slot.chip.cluster.members.length === 1 && slot.chip.face.pin.badge; as badge) {
              <span [class]="badgeClass">{{ badge }}</span>
            } @else if (slot.chip.current !== null) {
              <span class="text-[13px] leading-none font-bold tabular-nums"
                >{{ slot.chip.index + 1 }}<span class="opacity-55">/</span
                >{{ slot.chip.cluster.members.length }}</span
              >
            } @else if (slot.chip.cluster.members.length > 1) {
              <span class="text-[17px] leading-none font-bold tabular-nums">{{
                slot.chip.cluster.members.length
              }}</span>
            } @else {
              <span class="text-[20px] leading-none">&#x25cf;</span>
            }
          </span>
          @if (slot.chip.tail !== 'none') {
            <span
              class="h-[34px] max-w-[180px] truncate rounded-full border border-riv-solid-btn-border bg-riv-solid-btn-fill text-[13px] leading-[32px] font-semibold text-riv-solid-btn-ink shadow-[0_4px_14px_rgba(7,42,58,0.28)] group-hover:bg-riv-solid-btn-hover group-aria-expanded:font-bold motion-safe:[transition:background-color_0.15s_ease]"
              [class]="slot.chip.tail === 'left' ? 'pl-[13px]' : 'pr-[13px]'"
              [style.margin-left.px]="slot.chip.tail === 'left' ? null : -slot.chip.coin / 2"
              [style.padding-left.px]="slot.chip.tail === 'left' ? null : slot.chip.coin / 2 + 8"
              [style.margin-right.px]="slot.chip.tail === 'left' ? -slot.chip.coin / 2 : null"
              [style.padding-right.px]="slot.chip.tail === 'left' ? slot.chip.coin / 2 + 8 : null"
              aria-hidden="true"
              >{{ slot.chip.text }}</span
            >
          }
        </button>
      } @else {
        <button
          type="button"
          appTouchTarget
          class="pointer-events-none absolute inline-flex size-11 items-center justify-center rounded-full border-2 border-riv-solid-btn-fill bg-riv-solid-btn-ink text-[13px] leading-none font-bold text-riv-solid-btn-fill opacity-0 inset-ring-2 inset-ring-riv-solid-btn-fill/25 focus-visible:z-[2] focus-visible:opacity-100"
          [style.left.px]="slot.chip.cluster.x"
          [style.top.px]="slot.chip.cluster.y"
          [style.translate]="'-50% -50%'"
          [attr.aria-label]="memberLabel(slot)"
          (click)="chosen.emit(slot.member.pin.id)"
        >
          <span aria-hidden="true">{{ slot.position }}</span>
        </button>
      }
    }
  `,
})
export class VariantNamedCycle {
  readonly clusters = input.required<readonly PinCluster[]>();
  readonly selected = input<string | null>(null);
  /** The map box's size: a tail that would run off it yields, since the box clips it. */
  readonly bounds = input<ScreenPoint>({ x: Infinity, y: Infinity });
  readonly chosen = output<string>();

  protected readonly badgeClass = MAP_CHROME_BADGE;

  /**
   * The stepper the preview card shows while a crowd member is open, or `null` for a lone pin —
   * the host hands it up to the page, which owns the card.
   */
  readonly stack = computed<CrowdStack | null>(() => {
    const open = this.selected();
    const cluster = this.clusters().find((candidate) =>
      candidate.members.some((member) => member.pin.id === open),
    );
    if (!cluster || cluster.members.length < 2) {
      return null;
    }
    const count = cluster.members.length;
    const index = cluster.members.findIndex((member) => member.pin.id === open);
    return {
      index,
      count,
      place: crowdName(cluster),
      prevId: cluster.members[(index - 1 + count) % count].pin.id,
      nextId: cluster.members[(index + 1) % count].pin.id,
    };
  });

  /**
   * Every member's button in feed order, keyed by the pin — never by the crowd — so a camera move
   * that re-groups a crowd keeps each element, and the focus it holds, in place.
   */
  protected readonly slots = computed<readonly Slot[]>(() =>
    this.chips().flatMap((chip) =>
      chip.cluster.members.map((member, at) => ({ member, chip, position: at + 1 })),
    ),
  );

  private readonly chips = computed<readonly Chip[]>(() => {
    const open = this.selected();
    const ordered = [...this.clusters()].sort((a, b) => b.members.length - a.members.length);
    const obstacles: Box[] = ordered.map((cluster) => disc(cluster));
    const bounds = this.bounds();
    const placed = new Map<string, Chip>();
    for (const cluster of ordered) {
      const index = cluster.members.findIndex((member) => member.pin.id === open);
      const current = index >= 0 ? cluster.members[index] : null;
      const next = cluster.members[(index + 1) % cluster.members.length];
      const face = current ?? cluster.members[0];
      const coin = cluster.members.length === 1 ? face.width : CROWD_PX;
      const own = disc(cluster);
      const others = obstacles.filter((box) => box !== own);
      const text = current ? current.pin.card.name : chipText(cluster);
      let tail: TailSide = 'none';
      for (const side of ['right', 'left'] as const) {
        const box = tailBox(cluster, coin, tailWidth(text), side);
        if (inside(box, bounds) && !others.some((other) => intersects(box, other))) {
          obstacles.push(box);
          tail = side;
          break;
        }
      }
      placed.set(cluster.key, { cluster, face, next, current, index, text, tail, coin });
    }
    return this.clusters().map((cluster) => placed.get(cluster.key)!);
  });

  protected chipLabel(chip: Chip): string {
    const { cluster, current, next } = chip;
    if (cluster.members.length === 1) {
      return `${next.pin.card.name}, ${next.pin.card.beach}`;
    }
    const where = `${cluster.members.length} venues at ${crowdName(cluster)}`;
    return current
      ? `${current.pin.card.name}, ${chip.index + 1} of ${where}; press again for ${next.pin.card.name}`
      : `${where}; press to open ${next.pin.card.name}`;
  }

  protected memberLabel({ member, chip, position }: Slot): string {
    return `${member.pin.card.name}, ${position} of ${chip.cluster.members.length} venues at ${crowdName(chip.cluster)}`;
  }
}

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function disc(cluster: PinCluster): Box {
  const half = CROWD_PX / 2;
  const across = (cluster.members.length === 1 ? cluster.width : CROWD_PX) / 2;
  return {
    left: cluster.x - across,
    top: cluster.y - half,
    right: cluster.x + across,
    bottom: cluster.y + half,
  };
}

function tailBox(cluster: PinCluster, coin: number, width: number, side: 'right' | 'left'): Box {
  const half = CROWD_PX / 2;
  const across = coin / 2;
  return side === 'right'
    ? {
        left: cluster.x + across,
        top: cluster.y - half,
        right: cluster.x + across + width,
        bottom: cluster.y + half,
      }
    : {
        left: cluster.x - across - width,
        top: cluster.y - half,
        right: cluster.x - across,
        bottom: cluster.y + half,
      };
}

function inside(box: Box, bounds: ScreenPoint): boolean {
  return box.left >= 0 && box.top >= 0 && box.right <= bounds.x && box.bottom <= bounds.y;
}

function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** The beach when the crowd agrees on one, both when it spans two, a count beyond that. */
function crowdName(cluster: PinCluster): string {
  const beaches = beachesOf(cluster);
  if (beaches.length === 1) {
    return beaches[0];
  }
  return beaches.length === 2 ? `${beaches[0]} & ${beaches[1]}` : `${beaches.length} beaches`;
}

function chipText(cluster: PinCluster): string {
  return cluster.members.length === 1 ? cluster.members[0].pin.card.name : crowdName(cluster);
}

function beachesOf(cluster: PinCluster): readonly string[] {
  return [...new Set(cluster.members.map((member) => member.pin.card.beach))];
}

function tailWidth(text: string): number {
  return Math.min(TAIL_TEXT_MAX, textWidth(text, TAIL_FONT)) + TAIL_PADDING;
}
