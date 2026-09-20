import { DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { PanelGlass } from '../../shared/panel-glass';
import { TouchTarget } from '../../shared/touch-target';
import { clampLift, Detent, detentAt, offsetFor, sheetTop, sheetTops } from './sheet-geometry';

/** The shell's chrome the sheet measures: its class names are `app.html`'s, pinned by `app.spec.ts`. */
const HEADER_SELECTOR = 'header.riv-header';
const TAB_BAR_SELECTOR = '.riv-tab-bar';
/** A revealed row lands this far under the list's top edge. */
const REVEAL_LEAD_PX = 8;
/** The Map pill floats this far above the tab bar (or the window's bottom where there is none). */
const MAP_PILL_LIFT_PX = 12;

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
 * height (61 on a phone, 0 from `sm` where it is hidden) and the header's (73). The first rest is
 * taken again on the next frame when it did not land, because the measured geometry reaches the
 * DOM one pass later than the signals that carry it.
 *
 * <p>The head goes in through `[sheetHead]`, the rows through the default slot; the page keeps
 * every word and every row, this component keeps the physics.
 */
@Component({
  selector: 'app-discover-sheet',
  imports: [PanelGlass, TouchTarget],
  host: {
    class: 'contents',
    '(window:resize)': 'remeasure()',
  },
  template: `
    <div
      #scroller
      data-testid="sheet-scroller"
      class="pointer-events-none fixed inset-x-0 z-[10] snap-y snap-mandatory overflow-y-auto overscroll-contain scrollbar-none motion-safe:scroll-smooth"
      [style.top.px]="tops().full"
      [style.bottom.px]="chrome().tabBar"
      [attr.data-detent]="detent()"
      (scroll)="onScroll()"
    >
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
      >
        <div
          data-testid="sheet-head"
          class="shrink-0 rounded-t-[26px] bg-riv-tabbar-glass pb-3 backdrop-blur-[22px]"
        >
          <button
            type="button"
            data-testid="sheet-grabber"
            data-touch-exempt="the whole head is the drag surface; the bar is its cue"
            class="flex h-[22px] w-full items-center justify-center"
            aria-label="Resize the list"
            (click)="cycle()"
          >
            <span class="block h-[5px] w-9 rounded-full bg-riv-ink-faint" aria-hidden="true"></span>
          </button>
          <ng-content select="[sheetHead]" />
        </div>
        <div
          #list
          data-testid="sheet-list"
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
          <span aria-hidden="true">⌖</span> Map
        </button>
      </div>
    }
  `,
})
export class DiscoverSheet {
  private readonly document = inject(DOCUMENT);
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');
  private readonly lifted = viewChild.required<ElementRef<HTMLElement>>('lifted');

  protected readonly MAP_PILL_LIFT_PX = MAP_PILL_LIFT_PX;

  private readonly measured = signal(0);
  /** The viewport and the shell's chrome as last measured. */
  readonly chrome = signal({ viewportW: 0, viewportH: 0, header: 0, tabBar: 0 });
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
    let restedAt = -1;
    afterRenderEffect({
      write: () => {
        const scroller = this.scroller().nativeElement;
        const want = offsetFor(this.tops(), 'half');
        if (want === restedAt) {
          return;
        }
        restedAt = want;
        const rest = (): void => {
          scrollScroller(scroller, want, 'instant');
          this.scrolled.set(scroller.scrollTop);
        };
        rest();
        // The measured sheet reaches the DOM next pass, so a rest taken now clamps short.
        if (scroller.scrollTop !== want) {
          this.document.defaultView?.requestAnimationFrame(rest);
        }
      },
    });
    afterRenderEffect({
      write: () => {
        if (this.atFull()) {
          this.list().nativeElement.scrollTop = this.lift();
        }
      },
    });
  }

  protected remeasure(): void {
    this.measured.update((n) => n + 1);
  }

  protected onScroll(): void {
    const wasFull = this.atFull();
    this.scrolled.set(this.scroller().nativeElement.scrollTop);
    if (wasFull && !this.atFull()) {
      this.lift.set(this.list().nativeElement.scrollTop);
    }
  }

  /** Rest the sheet at a height; the scroller's own `scroll-behavior` decides whether it glides. */
  go(detent: Detent): void {
    const scroller = this.scroller().nativeElement;
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
    const list = this.list().nativeElement;
    const box = list.getBoundingClientRect();
    const offset = row.getBoundingClientRect().top - box.top - REVEAL_LEAD_PX;
    if (this.atFull()) {
      list.scrollTop = list.scrollTop + offset;
      return;
    }
    const room = this.chrome().viewportH - this.chrome().tabBar - box.top;
    const listHeight = this.lifted().nativeElement.offsetHeight;
    this.lift.update((lift) => clampLift(lift + offset, listHeight, room));
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
