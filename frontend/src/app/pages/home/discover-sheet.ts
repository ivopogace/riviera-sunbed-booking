import { DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { focusMover } from '../../shared/focus-after-render';
import { MapIcon } from '../../shared/map-icon';
import { PanelGlass } from '../../shared/panel-glass';
import { TouchTarget } from '../../shared/touch-target';
import {
  clampLift,
  Detent,
  detentAt,
  HEAD_PX,
  offsetFor,
  restAfterDrag,
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
/** A touch moves this far before it is a drag: a tap's own jitter stays a tap. */
const DRAG_SLOP_PX = 8;
/** A drag's release speed is read over this last stretch of it. */
const VELOCITY_WINDOW_MS = 100;
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
 * An element destroyed mid-gesture takes its `touchend` with it and the finger flag sticks; nothing
 * moving the sheet this long means the gesture is over. Generous: a reader is not a stale finger.
 */
const STALE_TOUCH_MS = 6_000;

/**
 * The Discover sheet over the map, resting at half (opens here), peek or full. Two scroll-snap
 * scrollers: the OUTER (a spacer with zero-height peek/half targets, then the sheet) and the INNER
 * list, scrollable only at full. A finger drags the sheet (`onDragMove`): iOS Safari won't
 * touch-scroll the `pointer-events: none` outer. Below full a row's lift is a clamped translate,
 * handed to the list's `scrollTop` at full so rows never jump. Tab bar and header heights are
 * measured at runtime, never constants; the page owns the words and rows, this the physics.
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
          [class.touch-pan-x]="!atFull()"
          [style.height.px]="tops().sheetHeight"
          aria-label="Venues"
          (touchstart)="onTouch(true); onDragStart($event)"
          (touchmove)="onDragMove($event)"
          (touchend)="onTouch($event.touches.length > 0); onDragEnd()"
          (touchcancel)="onTouch($event.touches.length > 0); onDragEnd()"
        >
          <div
            data-testid="sheet-head"
            class="shrink-0 touch-pan-x rounded-t-[26px] bg-riv-tabbar-glass pb-3 backdrop-blur-[22px]"
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
          (click)="showMap()"
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
  /** A finger is on the sheet. */
  private readonly touched = signal(false);
  /** The scroll is still moving — a fling, a snap, or a `go` glide — until it goes quiet. */
  private readonly rolling = signal(false);
  /** The finger on the sheet: where it went down, and once it has moved, whether the drag is the sheet's. */
  private drag:
    | {
        readonly x: number;
        readonly y: number;
        readonly from: number;
        readonly inList: boolean;
        owned?: boolean;
        samples: { readonly y: number; readonly t: number }[];
      }
    | undefined;
  private quietTimer: number | undefined;
  private staleTouchTimer: number | undefined;
  private readonly moveFocus = focusMover({ preventScroll: true });
  /**
   * No finger on the sheet and no scroll running. Mobile browsers fire `resize` mid-gesture (URL
   * bar, keyboard); a rest then yanks the sheet from under the finger or undoes the Map pill glide.
   */
  readonly settled = computed(() => !this.touched() && !this.rolling());

  constructor() {
    // `isolate: false` shares one jsdom per worker, so a timer outliving its fixture leaks across specs.
    inject(DestroyRef).onDestroy(() => {
      this.document.defaultView?.clearTimeout(this.quietTimer);
      this.document.defaultView?.clearTimeout(this.staleTouchTimer);
    });
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
   * Rest at `want`, retaken next frame (up to `REST_ATTEMPTS`) while browser snapping carries it; a
   * superseded rest retires. It reads back where the scroller clamped it, so its caller runs in
   * `mixedReadWrite`, never `write`.
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
      // `touched`, not `settled`: the rest's own scroll unsettles the sheet, so that would abandon every chain.
      if (this.touched()) {
        // Shut the opening window, or `restTarget` stays armed and no re-measure ever rests again.
        this.opened.set(true);
        return;
      }
      if (scroller.scrollTop === want) {
        this.opened.set(true);
      } else {
        this.rest(scroller, want, attempt + 1);
      }
    });
  }

  /**
   * Whether a finger is still on the sheet. Touch and not pointer, because the browser fires
   * `pointercancel` a frame or two into taking the gesture over for its own scrolling.
   */
  protected onTouch(down: boolean): void {
    this.touched.set(down);
    if (down) {
      this.watchForStaleTouch();
    } else {
      // The fling outlives the finger, so the quiet window carries on from here.
      this.keepRolling();
    }
  }

  /** Releases the finger flag once nothing has moved the sheet for {@link STALE_TOUCH_MS}. */
  private watchForStaleTouch(): void {
    const window = this.document.defaultView;
    if (this.staleTouchTimer !== undefined) {
      window?.clearTimeout(this.staleTouchTimer);
    }
    this.staleTouchTimer = window?.setTimeout(() => {
      this.staleTouchTimer = undefined;
      this.touched.set(false);
      // The same lost `touchend` strands a drag: settle it, or snapping stays off.
      this.onDragEnd();
    }, STALE_TOUCH_MS);
  }

  /** The scroll is moving, and stays that way until `SETTLE_QUIET_MS` passes with nothing moving it. */
  private keepRolling(): void {
    const window = this.document.defaultView;
    this.rolling.set(true);
    if (this.touched()) {
      this.watchForStaleTouch();
    }
    if (this.quietTimer !== undefined) {
      window?.clearTimeout(this.quietTimer);
    }
    this.quietTimer = window?.setTimeout(() => {
      this.quietTimer = undefined;
      this.rolling.set(false);
      if (this.drag?.owned !== true) {
        this.snap(true);
      }
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

  protected onDragStart(event: TouchEvent): void {
    const scroller = this.scroller()?.nativeElement;
    const finger = event.touches[0];
    if (scroller === undefined || finger === undefined || event.touches.length > 1) {
      // A second finger is a pinch or a stray, never the sheet's drag: let the first one's go.
      this.onDragEnd();
      return;
    }
    this.drag = {
      x: finger.clientX,
      y: finger.clientY,
      from: scroller.scrollTop,
      inList: this.list()?.nativeElement.contains(event.target as Node) ?? false,
      samples: [{ y: finger.clientY, t: event.timeStamp }],
    };
  }

  /**
   * A vertical touch the sheet `claims` follows the finger as the outer `scrollTop`, with the
   * browser kept out (`touch-pan-x`, `preventDefault`) or iOS hands it to pull-to-refresh. A
   * sideways touch (a rail, a photo) and the list's own scroll at full stay the browser's.
   */
  protected onDragMove(event: TouchEvent): void {
    const drag = this.drag;
    const scroller = this.scroller()?.nativeElement;
    const finger = event.touches[0];
    if (drag === undefined || scroller === undefined || finger === undefined) {
      return;
    }
    const dy = finger.clientY - drag.y;
    if (drag.owned === undefined) {
      const dx = finger.clientX - drag.x;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_SLOP_PX) {
        // Only the list at full scrolls natively; a pull down from its top must not start there.
        if (this.atFull() && drag.inList && event.cancelable && this.claims(true, dy)) {
          event.preventDefault();
        }
        return;
      }
      drag.owned = Math.abs(dy) >= Math.abs(dx) && this.claims(drag.inList, dy);
      if (drag.owned) {
        this.snap(false);
        scroller.style.scrollBehavior = 'auto';
      }
    }
    if (!drag.owned) {
      return;
    }
    // Every move, not only the first: iOS starts its own scroll on any move it is let through.
    if (event.cancelable) {
      event.preventDefault();
    }
    const full = offsetFor(this.tops(), 'full');
    scroller.scrollTop = Math.min(full, Math.max(0, drag.from - dy));
    this.onScroll();
    drag.samples.push({ y: finger.clientY, t: event.timeStamp });
    while (drag.samples.length > 2 && event.timeStamp - drag.samples[0].t > VELOCITY_WINDOW_MS) {
      drag.samples.shift();
    }
  }

  protected onDragEnd(): void {
    const drag = this.drag;
    const scroller = this.scroller()?.nativeElement;
    this.drag = undefined;
    if (drag?.owned !== true || scroller === undefined) {
      return;
    }
    // The release glides; the drag's moves did not.
    scroller.style.scrollBehavior = '';
    const first = drag.samples[0];
    const last = drag.samples.at(-1) ?? first;
    const span = last.t - first.t;
    // Finger up is scroll down the spacer: the sign flips from screen y to scroll offset.
    const velocity = span > 0 ? (first.y - last.y) / span : 0;
    this.go(restAfterDrag(scroller.scrollTop, velocity, this.tops()));
  }

  /**
   * Whether a vertical drag is the sheet's: always below full, where the list cannot scroll; at
   * full only on the head, or down from the list's top — the rest is the list's own scroll.
   */
  private claims(inList: boolean, dy: number): boolean {
    if (!this.atFull() || !inList) {
      return true;
    }
    return dy > 0 && (this.list()?.nativeElement.scrollTop ?? 0) <= 0;
  }

  /**
   * Snapping is off while a drag or a glide moves the sheet, on again once it is quiet on a rest:
   * a snap container re-snaps every `scrollTop` a drag writes, and WebKit re-snaps to its last
   * rest on any layout change (the pill leaving mid-glide). Written now, not at the next render.
   */
  private snap(on: boolean): void {
    const scroller = this.scroller()?.nativeElement;
    if (scroller !== undefined) {
      scroller.style.scrollSnapType = on ? '' : 'none';
    }
  }

  /**
   * Rest the sheet at a height; the scroller's own `scroll-behavior` decides whether it glides.
   * Once opened, a call (a press or a drag's release) supersedes a rest still confirming itself;
   * before that the opening rest owns the sheet.
   */
  go(detent: Detent): void {
    const scroller = this.scroller()?.nativeElement;
    if (scroller === undefined) {
      return;
    }
    // A glide is in flight from here: a re-measure landing on top of it must not cut it short.
    this.keepRolling();
    this.snap(false);
    const want = offsetFor(this.tops(), detent);
    if (this.opened()) {
      this.restTarget = want;
    }
    scrollScroller(scroller, want);
    this.onScroll();
  }

  /**
   * Show map means the map: the sheet drops to peek, the head alone left above the tab bar. The
   * pill's own tap destroys it, so focus lands on the grabber rather than `<body>` (RV-FE-9).
   */
  protected showMap(): void {
    this.go('peek');
    this.moveFocus('sheet-grabber');
  }

  /** The grabber's tap cycles half and full only; peek is a drag's or the Show map pill's. */
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
