import { DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { MapIcon } from '../../shared/map-icon';
import { PanelGlass } from '../../shared/panel-glass';
import { TouchTarget } from '../../shared/touch-target';
import {
  clampLift,
  Detent,
  detentAt,
  HEAD_PX,
  offsetFor,
  sheetTop,
  sheetTops,
} from './sheet-geometry';

/** The shell's chrome the sheet measures: its class names are `app.html`'s, pinned by `app.spec.ts`. */
export const HEADER_SELECTOR = 'header.riv-header';
const TAB_BAR_SELECTOR = '.riv-tab-bar';
/** A revealed row lands this far under the list's top edge. */
const REVEAL_LEAD_PX = 8;
/** The Map pill floats this far above the tab bar (or the window's bottom where there is none). */
const MAP_PILL_LIFT_PX = 12;
/** How many frames the opening rest is retaken while the browser's snapping carries it elsewhere. */
const REST_ATTEMPTS = 8;
/** The list's bottom padding: the Map pill's 44, its 12 px lift and 12 px of air, so the last row clears it. */
const LIST_PAD_BOTTOM_PX = 68;
/**
 * How long after the last scroll event the sheet counts as settled. Long enough to bridge the
 * frame gaps inside one snap animation or fling, short enough that a rotation re-rests at once.
 */
const SETTLE_QUIET_MS = 160;

/**
 * The Discover venue sheet: the list as a sheet over the riviera map with three resting heights
 * — half (opens here), peek (the head alone above the tab bar) and full (the list, a 44 px sliver
 * of map kept under the header, a `Map` pill at the foot as the way back).
 *
 * <p>It is **two CSS scroll-snap scrollers, not a pointer drag**. The OUTER holds a transparent
 * spacer over the map with the peek and half rests as zero-height `snap-always` targets, then
 * the sheet itself, exactly one snapport tall, snapping at full — so a flick raises the sheet and
 * stops at full. The INNER is the list: a scroller at full, `overflow: clip` below it, so a touch
 * on the list at half goes to the outer scroller and moves the sheet, and at full a pull from the
 * list's top lowers it — the browser's own scroll latching, no drag arithmetic. Below full the
 * list cannot scroll, so a revealed row's lift is a translate, clamped as a scroller clamps, and
 * handed to the list's real `scrollTop` on arrival at full (and back on the way down), so the
 * rows never jump.
 *
 * <p>The shipped chrome is **measured at runtime, never a constant**: the tab bar's rendered
 * height (61 on a phone, 0 from `sm` where it is hidden) and the header's (73). The scrollers
 * render only once the chrome is measured, and the first rest is confirmed on the next frame,
 * because a rest taken at a layout with every rest at offset 0 is carried to full. A re-measure
 * never re-rests while the sheet is moving, though — a phone fires `resize` mid-gesture every
 * time its URL bar or on-screen keyboard moves, and the rest it asks for waits for `settled`
 * rather than scrolling the sheet out from under the finger.
 *
 * <p>The head goes in through `[sheetHead]`, the rows through the default slot; the page keeps
 * every word and every row, this component keeps the physics.
 */
@Component({
  selector: 'app-discover-sheet',
  imports: [MapIcon, PanelGlass, TouchTarget],
  host: {
    class: 'contents',
    '(window:resize)': 'remeasure()',
  },
  template: `
    <!-- Rendered only once the chrome is measured: at a first layout with every rest at offset 0, Chrome keeps the sheet as its snap target and re-snaps to it — full — once the heights land. -->
    @if (measuredOnce()) {
      <div
        #scroller
        data-testid="sheet-scroller"
        class="pointer-events-none fixed inset-x-0 z-[10] snap-y snap-mandatory overflow-y-auto overscroll-contain [overflow-anchor:none] scrollbar-none motion-safe:scroll-smooth"
        [style.top.px]="tops().full"
        [style.bottom.px]="chrome().tabBar"
        [attr.data-detent]="detent()"
        (scroll)="onScroll()"
      >
        <!-- overflow-anchor none: the spacer's height lands a pass after the first rest, and Chrome's scroll anchoring would carry the sheet to full with it. -->
        <!-- The spacer over the map: peek at its top, half part-way down, both zero-height rests. -->
        <div class="relative" [style.height.px]="tops().peek - tops().full">
          <div class="absolute inset-x-0 top-0 h-0 snap-start snap-always"></div>
          <div
            class="absolute inset-x-0 h-0 snap-start snap-always"
            [style.top.px]="tops().peek - tops().half"
          ></div>
        </div>
        <section
          appPanelGlass
          data-testid="sheet"
          class="pointer-events-auto flex snap-start snap-always flex-col rounded-t-[26px] shadow-[0_-12px_40px_rgba(7,42,58,0.28)]"
          [style.height.px]="tops().sheetHeight"
          aria-label="Venues"
          (pointerdown)="onPointer(true)"
          (pointerup)="onPointer(false)"
          (pointercancel)="onPointer(false)"
        >
          <div
            data-testid="sheet-head"
            class="shrink-0 rounded-t-[26px] bg-riv-tabbar-glass pb-3 backdrop-blur-[22px]"
          >
            <button
              type="button"
              data-testid="sheet-grabber"
              data-touch-exempt="the whole head is the drag surface; the bar is its cue"
              class="flex h-[22px] w-full touch-manipulation items-center justify-center"
              aria-label="Resize the list"
              (click)="cycle()"
            >
              <span
                class="block h-[5px] w-9 rounded-full bg-riv-ink-faint"
                aria-hidden="true"
              ></span>
            </button>
            <ng-content select="[sheetHead]" />
          </div>
          <!-- Below full the list is clipped, not scrolled: a row cut by the sheet's edge is reached whole by raising the sheet, which is what data-touch-pans tells the touch-target sweep. -->
          <div
            #list
            data-testid="sheet-list"
            data-touch-pans="the sheet rises: a row cut by its edge is reached whole by pulling the sheet up"
            class="min-h-0 flex-1 px-3 pb-[68px] scrollbar-none"
            [class.overflow-y-auto]="atFull()"
            [class.overflow-clip]="!atFull()"
          >
            <div #lifted [style.translate]="atFull() ? null : '0 ' + -lift() + 'px'">
              <ng-content />
            </div>
          </div>
        </section>
      </div>
    }

    @if (atFull()) {
      <div
        class="pointer-events-none fixed inset-x-0 z-[11] flex justify-center"
        [style.bottom.px]="chrome().tabBar + MAP_PILL_LIFT_PX"
      >
        <button
          type="button"
          appTouchTarget
          data-testid="sheet-map-pill"
          class="pointer-events-auto inline-flex h-11 touch-manipulation items-center gap-2 rounded-full bg-riv-accent-ink px-5 text-[15px] font-bold text-riv-on-accent-ink shadow-[0_10px_28px_rgba(7,42,58,0.35)]"
          (click)="go('half')"
        >
          <app-map-icon /> Show map
        </button>
      </div>
    }
  `,
})
export class DiscoverSheet {
  private readonly document = inject(DOCUMENT);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private readonly lifted = viewChild<ElementRef<HTMLElement>>('lifted');

  protected readonly MAP_PILL_LIFT_PX = MAP_PILL_LIFT_PX;

  private readonly measured = signal(0);
  /** The viewport and the shell's chrome as last measured. */
  readonly chrome = signal({ viewportW: 0, viewportH: 0, header: 0, tabBar: 0 });
  /** The viewport has been measured, so the scrollers can take their first layout at the real heights. */
  protected readonly measuredOnce = computed(() => this.chrome().viewportH > 0);
  /** Where the sheet's top rests at each height, and its one-snapport height. */
  readonly tops = computed(() => sheetTops(this.chrome()));
  /** The outer scroller's `scrollTop`, mirrored on every scroll event: the one number the sheet is. */
  private readonly scrolled = signal(0);
  /** The nearest rest to where the sheet is now. */
  readonly detent = computed<Detent>(() => detentAt(this.scrolled(), this.tops()));
  readonly atFull = computed(() => this.detent() === 'full');
  /** The sheet's top edge in viewport px, following a drag between rests. */
  readonly sheetTop = computed(() => sheetTop(this.tops(), this.scrolled()));
  /** How far the list is lifted inside the sheet below full; the list's `scrollTop` at full. */
  readonly lift = signal(0);
  /** The offset the sheet is resting *for*; a rest for any other offset has been superseded. */
  private restTarget: number | undefined;
  /** A pointer is down on the sheet. */
  private readonly touched = signal(false);
  /** The scroll is still moving — a fling, a snap, or a `go` glide — until it goes quiet. */
  private readonly rolling = signal(false);
  private quietTimer: number | undefined;
  /**
   * The scroll belongs to the tourist (or to a glide already asked for). A mobile browser fires
   * `resize` in the middle of one whenever its URL bar or the on-screen keyboard moves, and the
   * re-rest that follows scrolls the sheet out from under the finger — or turns the Map pill's
   * own glide straight back into full, which reads as a dead button.
   */
  readonly settled = computed(() => !this.touched() && !this.rolling());

  constructor() {
    afterRenderEffect({
      earlyRead: () => {
        this.measured();
        const window = this.document.defaultView;
        const header = this.document.querySelector(HEADER_SELECTOR);
        const tabBar = this.document.querySelector(TAB_BAR_SELECTOR);
        this.chrome.set({
          viewportW: window?.innerWidth ?? 0,
          viewportH: window?.innerHeight ?? 0,
          header: Math.round(header?.getBoundingClientRect().height ?? 0),
          tabBar: Math.round(tabBar?.getBoundingClientRect().height ?? 0),
        });
      },
    });
    // mixedReadWrite, not write: `rest` scrolls and reads back where it landed (see its doc).
    afterRenderEffect({
      mixedReadWrite: () => {
        const tops = this.tops();
        const scroller = this.scroller()?.nativeElement;
        // Read unconditionally, so a re-measure taken mid-gesture still re-runs this once it settles.
        if (scroller === undefined || !this.settled()) {
          return;
        }
        const want = offsetFor(tops, untracked(this.opened) ? untracked(this.detent) : 'half');
        if (want === this.restTarget) {
          return;
        }
        this.rest(scroller, want, 0);
      },
    });
    afterRenderEffect({
      write: () => {
        const list = this.list()?.nativeElement;
        if (list !== undefined && this.atFull()) {
          list.scrollTop = this.lift();
        }
      },
    });
  }

  protected remeasure(): void {
    this.measured.update((n) => n + 1);
  }

  /** Whether the opening rest has landed; from then on a re-measure keeps the tourist's detent, and a scroll is the tourist's. */
  readonly opened = signal(false);

  /**
   * Rest at an offset, cut, and confirm on the next frame that the rest held: a rest taken before
   * the scroller's geometry has settled is carried elsewhere by the browser's own snapping, so it
   * is retaken, a few frames at most.
   *
   * <p>Only the offset the sheet is resting for is still worth confirming: a re-measure starts a
   * rest for a new one, and a rest it superseded retires rather than undo it.
   *
   * <p>It scrolls and then reads back where the scroller actually landed — the browser clamps a
   * rest to the scrollable range — so its caller runs in `mixedReadWrite`, the phase for work
   * whose read cannot be divided from its write, never in `write`.
   */
  private rest(scroller: HTMLElement, want: number, attempt: number): void {
    this.restTarget = want;
    scrollScroller(scroller, want, 'instant');
    this.scrolled.set(scroller.scrollTop);
    if (attempt >= REST_ATTEMPTS) {
      this.opened.set(true);
      return;
    }
    this.document.defaultView?.requestAnimationFrame(() => {
      if (want !== this.restTarget) {
        return;
      }
      if (scroller.scrollTop === want) {
        this.opened.set(true);
      } else {
        this.rest(scroller, want, attempt + 1);
      }
    });
  }

  /** A pointer landed on the sheet, or left it: while one is down the browser owns the scroll. */
  protected onPointer(down: boolean): void {
    this.touched.set(down);
    if (!down) {
      // The fling outlives the finger, so the quiet window carries on from here.
      this.keepRolling();
    }
  }

  /** The scroll is moving, and stays that way until `SETTLE_QUIET_MS` passes with nothing moving it. */
  private keepRolling(): void {
    const window = this.document.defaultView;
    this.rolling.set(true);
    if (this.quietTimer !== undefined) {
      window?.clearTimeout(this.quietTimer);
    }
    this.quietTimer = window?.setTimeout(() => {
      this.quietTimer = undefined;
      this.rolling.set(false);
    }, SETTLE_QUIET_MS);
  }

  protected onScroll(): void {
    const scroller = this.scroller()?.nativeElement;
    const list = this.list()?.nativeElement;
    if (scroller === undefined || list === undefined) {
      return;
    }
    this.keepRolling();
    const wasFull = this.atFull();
    this.scrolled.set(scroller.scrollTop);
    if (wasFull && !this.atFull()) {
      this.lift.set(list.scrollTop);
    }
  }

  /** Rest the sheet at a height; the scroller's own `scroll-behavior` decides whether it glides. */
  go(detent: Detent): void {
    const scroller = this.scroller()?.nativeElement;
    if (scroller === undefined) {
      return;
    }
    // A glide is in flight from here: a re-measure landing on top of it must not cut it short.
    this.keepRolling();
    scrollScroller(scroller, offsetFor(this.tops(), detent));
    this.onScroll();
  }

  /** The grabber's tap cycles half and full only; peek is a drag's, never a tap's. */
  protected cycle(): void {
    this.go(this.detent() === 'half' ? 'full' : 'half');
  }

  /**
   * Bring a row to the list's top: the list's own scroll at full; below it a lift, clamped as a
   * scroller would be so a short list is never lifted into blank glass.
   */
  reveal(row: HTMLElement): void {
    const list = this.list()?.nativeElement;
    const lifted = this.lifted()?.nativeElement;
    if (list === undefined || lifted === undefined) {
      return;
    }
    const box = list.getBoundingClientRect();
    const offset = row.getBoundingClientRect().top - box.top - REVEAL_LEAD_PX;
    if (this.atFull()) {
      list.scrollTop = list.scrollTop + offset;
      return;
    }
    // The clamp is the list's own at full — its overflow there — so the handoff never jumps.
    const room = this.tops().sheetHeight - HEAD_PX;
    this.lift.update((lift) =>
      clampLift(lift + offset, lifted.offsetHeight + LIST_PAD_BOTTOM_PX, room),
    );
  }
}

/** `scrollTo` where the platform has it (jsdom has not); a bare `scrollTop` is the same rest, cut. */
function scrollScroller(scroller: HTMLElement, top: number, behavior?: ScrollBehavior): void {
  if (typeof scroller.scrollTo === 'function') {
    scroller.scrollTo(behavior === undefined ? { top } : { top, behavior });
  } else {
    scroller.scrollTop = top;
  }
}
