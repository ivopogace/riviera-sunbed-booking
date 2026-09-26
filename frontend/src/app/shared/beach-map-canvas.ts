import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  contentChild,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';

import { BeachGridFrame } from './beach-grid-frame';
import { TouchTarget } from './touch-target';

/**
 * The canvas's per-row contract: what the shared chrome needs to know about a row.
 * Each surface passes its own richer row objects (tiles, cells, sets …) — the canvas reads
 * only these fields and hands the full object back to the projected tile-row template.
 */
export interface BeachMapCanvasRow {
  /** The rail chip's row identity, unique per map (used as track key) — each surface supplies
   *  its own: the tourist map and the Daily view pass the stored `rowLabel` (#724; uniqueness
   *  from grouping rows by it), the layout editor its grid letters (a grid being painted). */
  readonly code: string;
  /** The zone chip's text; `null` renders no chip even on a zone start. The rail caps the chip's
   *  width and ellipsizes what does not fit (92px below `sm`, 128px above), so this may be a
   *  phrase — a price plus what it buys — and not only an amount. */
  readonly priceLabel: string | null;
  /** True where this row starts a new price zone — draws the zone gap + the price chip. */
  readonly zoneStart: boolean;
  /** How many tiles the row renders — drives the uniform `--riv-map-cols` column count. */
  readonly tileCount: number;
}

/** The projected tile-row template's context: the surface's own row object plus its index. */
export interface BeachMapRowContext<R extends BeachMapCanvasRow> {
  readonly $implicit: R;
  readonly index: number;
}

/**
 * Declares the canvas's tile-row template and carries the rows it renders — binding the rows
 * on the template keeps the context typed to the surface's own row shape:
 * `<ng-template [appBeachMapRow]="rows()" let-row let-i="index">`.
 */
@Directive({ selector: 'ng-template[appBeachMapRow]' })
export class BeachMapRowDef<R extends BeachMapCanvasRow = BeachMapCanvasRow> {
  readonly appBeachMapRow = input.required<readonly R[]>();
  readonly template = inject<TemplateRef<BeachMapRowContext<R>>>(TemplateRef);

  static ngTemplateContextGuard<R extends BeachMapCanvasRow>(
    _dir: BeachMapRowDef<R>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in the type predicate only
    _ctx: unknown,
  ): _ctx is BeachMapRowContext<R> {
    return true;
  }
}

/**
 * Shared beach-map chrome around each surface's projected {@link BeachMapRowDef} rows — frame,
 * sea→sand wash (`--riv-map-*` tokens), aria-hidden rails (tile names carry row and price), and a
 * pan viewport gated on real overflow; it shares chrome, never tile behaviour. A drag past 6px pans
 * and swallows the one click ending it, never a keyboard click (`detail === 0`); vertical pan only
 * while the wash overflows; `dragPan` off where drag paints. While `loading`, rails are blank, pan
 * cues withheld, and decorative testids renamed so specs cannot mistake the skeleton for the map.
 */
@Component({
  selector: 'app-beach-map-canvas',
  imports: [BeachGridFrame, NgTemplateOutlet, TouchTarget],
  templateUrl: './beach-map-canvas.html',
  host: {
    class: 'block',
    '[style.--riv-tile]': 'tileSizeStyle()',
    '(document:mouseup)': 'onRailSweepEnd()',
    '(window:keydown.space)': 'onSpaceKeydown($event)',
    '(window:keyup.space)': 'onSpaceKeyup()',
  },
})
export class BeachMapCanvas {
  /** A drag that travels beyond this many pixels is a pan, not a tap. */
  private static readonly PAN_THRESHOLD_PX = 6;
  /** The default (non-fit) tile size — unchanged for the tourist map and Daily view (#709). */
  private static readonly DEFAULT_TILE = 'clamp(47px, 11vw, 56px)';
  /** {@link fitWidth}'s floor: the touch-target minimum (invariant carried by `[appTouchTarget]`
   *  on every tile button), never crossed however tight the viewport gets. */
  private static readonly FIT_MIN_TILE_PX = 44;
  /** {@link fitWidth}'s ceiling — the default clamp's own max, so a fitted grid never grows past
   *  what an unfitted one would render at. */
  private static readonly FIT_MAX_TILE_PX = 56;
  /** The row/column gap every surface paints its grid with (`gap-1.5`) — needed to solve for the
   *  per-tile width a column count actually has room for. */
  private static readonly TILE_GAP_PX = 6;

  /** Accessible name for the frame section (e.g. "Beach map — Miramar"). */
  readonly label = input<string>('');
  /** The frame section's `data-testid`. */
  readonly frameTestid = input<string>('beach-grid');
  /** The pan viewport's `data-testid` — the element that actually overflows horizontally. */
  readonly viewportTestid = input<string>('map-pan');
  /** Optional tab stop for the viewport (the Daily view's all-locked keyboard case). */
  readonly viewportTabindex = input<number | null>(null);
  /** Accessible name for the viewport; required when it is focusable. */
  readonly viewportLabel = input<string>('');
  /** Mouse drag-to-pan; a surface whose drag gesture is its own (paint) switches it off. */
  readonly dragPan = input<boolean>(true);
  /** Rail chip vocabulary, which fixes the rail's reserved width in loading AND loaded states:
   *  `letters` (editors) reserves nothing, `labels` a minimum a longer name still widens, and
   *  `capped-labels` (tourist) also ellipsizes so the phone rail cannot move. */
  readonly railCodes = input<'letters' | 'labels' | 'capped-labels'>('letters');
  /** Price-rail chip vocabulary, fixing its reserved width in both states: `amounts` (operator)
   *  reserves nothing beyond the 52px floor — a min–max span may still widen it, by choice;
   *  `capped-phrases` (tourist) reserves the 92px phone cap. Independent of {@link railCodes}. */
  readonly priceChips = input<'amounts' | 'capped-phrases'>('amounts');
  /** Draw a placeholder grid: rails reserve their columns but state nothing, and every gesture cue
   *  is withheld. Surfaces render skeletons THROUGH the canvas to inherit `--riv-tile` and frame
   *  geometry, so the canvas, not the surface, owns the difference. */
  readonly loading = input<boolean>(false);
  /**
   * Size tiles to the viewport's measured width (editor surfaces) instead of the default clamp;
   * they shrink to the {@link FIT_MIN_TILE_PX} touch-target floor before the grid overflows and pans.
   */
  readonly fitWidth = input<boolean>(false);

  /**
   * Turns the decorative `aria-hidden` row rail into a labelled fill button per row — the layout
   * editor's whole-row paint accelerator. Off by default: other surfaces keep the decorative rail.
   */
  readonly rowRailInteractive = input<boolean>(false);
  /** The accessible name for row {@code index}'s fill button — required whenever
   *  {@link rowRailInteractive} is true; read live so it tracks whichever tool is armed. */
  readonly rowRailLabel = input<((index: number) => string) | null>(null);
  /** Emitted on a row-rail fill button's click, or on each row entered during a
   *  mousedown→mouseenter drag-sweep across several. */
  readonly rowRailFill = output<number>();

  /** The column-header strip's counterpart to {@link rowRailInteractive} — nothing
   *  renders here at all unless a consumer opts in (#713); no existing surface has one. */
  readonly colHeaderInteractive = input<boolean>(false);
  /** The accessible name for column {@code index}'s fill button. */
  readonly colHeaderLabel = input<((index: number) => string) | null>(null);
  /** Emitted on a column-header fill button's click, or swept the same way as {@link rowRailFill}. */
  readonly colHeaderFill = output<number>();

  /** Shows the Fit/100% pill pair (#713) — off by default, so no other consumer renders it. */
  readonly zoomControl = input<boolean>(false);
  /**
   * Top padding inside the pannable viewport (`overflow-y: hidden`) so a cell that lifts on select
   * (the per-set editor's `-translate-y-1`) is not clipped. 0 by default.
   */
  readonly cellLiftHeadroomPx = input<number>(0);
  /** Fit is the existing measured-to-width sizing (#709, unchanged); 100% pins tiles to
   *  {@link FIT_MAX_TILE_PX} — the ceiling Fit itself never exceeds — and lets the grid overflow
   *  instead of shrinking further. Internal: no consumer needs to read or drive this from outside. */
  protected readonly zoomMode = signal<'fit' | 'full'>('fit');

  /** Space held (focus not on a control) while 100% zoom is active — a pan independent of
   *  {@link dragPan}. A surface whose drag paints must suppress it while `panGestureActive` is true
   *  ({@link LayoutEditor}'s `paintCell` reads it via a `viewChild`). */
  private readonly spaceHeld = signal(false);
  readonly panGestureActive = computed(
    () => this.zoomControl() && this.zoomMode() === 'full' && this.spaceHeld(),
  );

  /** Any element whose own native keyboard handling of Space this must not steal — a button's
   *  activation, but just as much a text field's ordinary typed space. */
  private static readonly SPACE_OWNING_CONTROLS =
    'button, input, textarea, select, [contenteditable=""], [contenteditable="true"]';

  /** Arms the gesture on Space — unless focus sits on a control with its own meaning for Space
   *  (a button's activation, a field's typed character), which this must never steal. */
  protected onSpaceKeydown(event: Event): void {
    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement.matches(BeachMapCanvas.SPACE_OWNING_CONTROLS)
    ) {
      return;
    }
    if (this.zoomControl() && this.zoomMode() === 'full') {
      event.preventDefault(); // stop the page from scrolling on Space once the gesture is live
    }
    this.spaceHeld.set(true);
  }

  protected onSpaceKeyup(): void {
    this.spaceHeld.set(false);
  }

  /** Rail width reserved by vocabulary in BOTH states — content-derived, the grid slides on load.
   *  A 54px minimum (the mobile cap), not the full cap: that would push a 14-column desktop venue
   *  into a pan. Only a label wider than 54px still shifts the grid. */
  protected readonly railColumnClass = computed(() => {
    // A fill button needs the 44px floor in both axes, not just the chip's min-w-6 (#713).
    if (this.rowRailInteractive()) {
      return 'min-w-11';
    }
    return this.railCodes() === 'letters' ? '' : 'min-w-[54px]';
  });

  /** The price rail's reservation, on {@link railColumnClass}'s terms: without it the viewport
   *  narrows from the right on load. A 92px minimum = the phone cap, so the phone rail cannot move,
   *  while a 14-column venue at 1280px still fits whole. */
  protected readonly priceColumnClass = computed(() =>
    this.priceChips() === 'amounts' ? '' : 'min-w-[92px]',
  );

  /** The #724 ellipsis, on the tourist rail only: two tiers, 48px of text and 96px from `sm`. */
  protected readonly railCodeTextClass = computed(() =>
    this.railCodes() === 'capped-labels' ? 'max-w-12 sm:max-w-[96px] truncate' : '',
  );

  /** The loading chip fills whatever the rail reserves, so the placeholder is the rail, not a pill in it. */
  protected readonly railPlaceholderClass = computed(() =>
    this.railCodes() === 'letters' ? 'min-w-6' : 'w-[54px]',
  );

  protected readonly rowDef = contentChild.required<BeachMapRowDef>(BeachMapRowDef);
  protected readonly rows = computed<readonly BeachMapCanvasRow[]>(() =>
    this.rowDef().appBeachMapRow(),
  );

  /** Uniform column count so every row's grid aligns with the rails. */
  protected readonly mapCols = computed(() => Math.max(1, ...this.rows().map((r) => r.tileCount)));

  /** 0-based column indexes for the header strip (#713) — one fill button per {@link mapCols}. */
  protected readonly colIndexes = computed(() =>
    Array.from({ length: this.mapCols() }, (_, i) => i),
  );

  /** The horizontal pan viewport, present only while rows render. */
  private readonly panViewport = viewChild<ElementRef<HTMLElement>>('canvasViewport');
  /** The vertical wash scroller wrapping the rails and the viewport; the 2D pan's y-axis target. */
  private readonly washScroller = viewChild<ElementRef<HTMLElement>>('washScroller');
  /** The tile grid inside the viewport — what the overflow gate measures. */
  private readonly rowGrid = viewChild<ElementRef<HTMLElement>>('rowGrid');
  /** True when the tile grid is wider than its viewport (drag hint + edge fade + snap padding). */
  protected readonly scrollHint = signal(false);
  /** True when the rows outgrow the wash scroller's height cap (drag hint only — no fade/snap). */
  protected readonly vScrollHint = signal(false);
  /** {@link fitWidth}'s measured tile size in px, or `null` before the first measurement / when
   *  {@link fitWidth} is off — {@link tileSizeStyle} falls back to {@link DEFAULT_TILE} either way. */
  private readonly fittedTilePx = signal<number | null>(null);
  /** The `--riv-tile` value actually painted: the fitted px while {@link fitWidth} is on and
   *  measured, the original viewport-relative clamp otherwise (tourist map, Daily view, and the
   *  fitted surfaces' own first frame, before a measurement has landed). */
  protected readonly tileSizeStyle = computed(() => {
    if (this.zoomControl() && this.zoomMode() === 'full') {
      return `${BeachMapCanvas.FIT_MAX_TILE_PX}px`;
    }
    const fitted = this.fittedTilePx();
    return this.fitWidth() && fitted !== null ? `${fitted}px` : BeachMapCanvas.DEFAULT_TILE;
  });

  /** Arms the Fit/100% pill pair (#713). */
  protected setZoom(mode: 'fit' | 'full'): void {
    this.zoomMode.set(mode);
  }

  /** Drag-pan surfaces hide both scrollbars (the drag and its hint are the affordance); others get a
   *  slim themed bar, or mouse users could reach off-screen tiles only via shift+wheel. No
   *  `scrollbar-gutter`: on the `overflow-y: hidden` viewport it wastes ~10px and stabilises nothing. */
  protected readonly scrollbarChrome = computed(() =>
    this.dragPan()
      ? 'scrollbar-none'
      : 'scrollbar-thin scrollbar-thumb-riv-accent-ink scrollbar-track-transparent',
  );

  // --- pan gesture state (imperative; not rendered) ---
  private panPointerDown = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartScroll = 0;
  private panStartScrollTop = 0;
  /** The gesture's vertical scroll target — the wash scroller, only while it overflowed at mousedown (D-1). */
  private panWash: HTMLElement | null = null;
  /** Set when the current gesture crossed the drag threshold; consumed by the next click. */
  private panned = false;

  /** The D-1 gate: the vertical pan axis (and its hint) engages only on actual overflow. */
  private static overflowsVertically(el: HTMLElement | undefined): el is HTMLElement {
    return !!el && el.scrollHeight > el.clientHeight + 1;
  }

  /** The tile grid's own width, less whatever horizontal padding `.pannable` puts on it. */
  private static contentWidth(grid: HTMLElement): number {
    const style = getComputedStyle(grid);
    return (
      grid.scrollWidth -
      (Number.parseFloat(style.paddingLeft) || 0) -
      (Number.parseFloat(style.paddingRight) || 0)
    );
  }

  /**
   * Viewport width over {@link mapCols} tiles plus gaps, clamped to the fit range; converges in one
   * extra render since `flex-1 min-w-0` sizes the viewport from its siblings, not its tiles.
   */
  private measureFittedTile(): number | null {
    if (!this.fitWidth()) {
      return null;
    }
    const el = this.panViewport()?.nativeElement;
    const cols = this.mapCols();
    if (!el || cols < 1) {
      return null;
    }
    const available = el.clientWidth - (cols - 1) * BeachMapCanvas.TILE_GAP_PX;
    const ideal = Math.floor(available / cols);
    return Math.min(
      BeachMapCanvas.FIT_MAX_TILE_PX,
      Math.max(BeachMapCanvas.FIT_MIN_TILE_PX, ideal),
    );
  }

  /** Read both overflow axes from the live DOM; every piece of pan chrome is gated on this. */
  private measureOverflow(): void {
    const el = this.panViewport()?.nativeElement;
    const grid = this.rowGrid()?.nativeElement;
    this.scrollHint.set(!!el && !!grid && BeachMapCanvas.contentWidth(grid) > el.clientWidth + 1);
    this.vScrollHint.set(BeachMapCanvas.overflowsVertically(this.washScroller()?.nativeElement));
    this.fittedTilePx.set(this.measureFittedTile());
  }

  constructor() {
    // The `read` phase, not the default mixedReadWrite: measuring is a pure DOM read.
    afterRenderEffect({
      read: () => {
        this.rows();
        this.measureOverflow();
      },
    });

    // A resize changes the overflow without changing rows, which the render effect can't see.
    effect((onCleanup) => {
      const el = this.panViewport()?.nativeElement;
      // jsdom has no ResizeObserver; that path is stubbed in the spec and real in the e2e.
      if (!el || typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(() => this.measureOverflow());
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    });

    // Capture-phase because template bindings bubble — the tile's handler would fire first.
    effect((onCleanup) => {
      const el = this.panViewport()?.nativeElement;
      if (!el) {
        return;
      }
      const onCaptureClick = (event: MouseEvent): void => {
        const suppress = this.panned && event.detail > 0;
        this.panned = false;
        if (suppress) {
          event.preventDefault();
          event.stopPropagation();
        }
      };
      el.addEventListener('click', onCaptureClick, true);
      onCleanup(() => el.removeEventListener('click', onCaptureClick, true));
    });
  }

  // --- drag-to-pan (mouse only; touch uses native overflow scrolling) ---

  /** Whether a mouse-drag on the viewport may start a pan right now — the ordinary {@link dragPan}
   *  gate everywhere {@link zoomControl} is off, or the {@link panGestureActive} gate once a
   *  consumer opts into 100% zoom (independent of {@link dragPan}, #713). */
  private mouseDragPanAllowed(): boolean {
    return this.zoomControl() && this.zoomMode() === 'full'
      ? this.panGestureActive()
      : this.dragPan();
  }

  protected onViewportMouseDown(event: MouseEvent): void {
    const el = this.panViewport()?.nativeElement;
    if (!el || !this.mouseDragPanAllowed()) {
      return;
    }
    const wash = this.washScroller()?.nativeElement;
    this.panPointerDown = true;
    this.panned = false;
    this.panStartX = event.clientX;
    this.panStartY = event.clientY;
    this.panStartScroll = el.scrollLeft;
    this.panWash = BeachMapCanvas.overflowsVertically(wash) ? wash : null;
    this.panStartScrollTop = this.panWash?.scrollTop ?? 0;
  }

  protected onViewportMouseMove(event: MouseEvent): void {
    const el = this.panViewport()?.nativeElement;
    if (!this.panPointerDown || !el) {
      return;
    }
    const dx = event.clientX - this.panStartX;
    const dy = this.panWash ? event.clientY - this.panStartY : 0;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > BeachMapCanvas.PAN_THRESHOLD_PX) {
      this.panned = true;
    }
    el.scrollLeft = this.panStartScroll - dx;
    if (this.panWash) {
      this.panWash.scrollTop = this.panStartScrollTop - dy;
    }
  }

  protected onViewportMouseUp(): void {
    this.panPointerDown = false;
  }

  // --- two-finger touch pan at 100% zoom (#713; the mouse pan stays mouse-only, unchanged) ---

  /** Two touch points' midpoint — the pan gesture's reference, so either finger lifting alone
   *  doesn't jump the anchor. */
  private static touchMidpoint(touches: TouchList): { x: number; y: number } {
    const a = touches[0];
    const b = touches[1];
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  protected onViewportTouchStart(event: TouchEvent): void {
    const el = this.panViewport()?.nativeElement;
    // Two fingers is its own gesture trigger — unlike the mouse path, it needs no Space held.
    const gestureAvailable = this.zoomControl() && this.zoomMode() === 'full';
    if (!el || !gestureAvailable || event.touches.length < 2) {
      return;
    }
    const wash = this.washScroller()?.nativeElement;
    this.panPointerDown = true;
    this.panned = false;
    const mid = BeachMapCanvas.touchMidpoint(event.touches);
    this.panStartX = mid.x;
    this.panStartY = mid.y;
    this.panStartScroll = el.scrollLeft;
    this.panWash = BeachMapCanvas.overflowsVertically(wash) ? wash : null;
    this.panStartScrollTop = this.panWash?.scrollTop ?? 0;
  }

  protected onViewportTouchMove(event: TouchEvent): void {
    const el = this.panViewport()?.nativeElement;
    if (!this.panPointerDown || !el || event.touches.length < 2) {
      return;
    }
    const mid = BeachMapCanvas.touchMidpoint(event.touches);
    const dx = mid.x - this.panStartX;
    const dy = this.panWash ? mid.y - this.panStartY : 0;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > BeachMapCanvas.PAN_THRESHOLD_PX) {
      this.panned = true;
    }
    el.scrollLeft = this.panStartScroll - dx;
    if (this.panWash) {
      this.panWash.scrollTop = this.panStartScrollTop - dy;
    }
  }

  protected onViewportTouchEnd(): void {
    this.panPointerDown = false;
  }

  // --- fill-rail drag-sweep (#713; imperative, not rendered) ---

  /** True while a primary-button press is down on a row-rail or column-header button. */
  private railSweeping = false;

  /** A rail fill button's mousedown: arms the sweep and fills the pressed index. */
  protected onRailDown(kind: 'row' | 'col', index: number, event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }
    this.railSweeping = true;
    this.emitRailFill(kind, index);
  }

  /** A rail fill button re-entered mid-drag: fill it too, or disarm on a stale flag. */
  protected onRailEnter(kind: 'row' | 'col', index: number, event: MouseEvent): void {
    if (!this.railSweeping) {
      return;
    }
    if ((event.buttons & 1) === 0) {
      this.railSweeping = false;
      return;
    }
    this.emitRailFill(kind, index);
  }

  /** A keyboard activation (Enter/Space, `detail === 0`) fills once — a mouse click already filled
   *  via {@link onRailDown}, so this ignores it rather than double-firing. */
  protected onRailClick(kind: 'row' | 'col', index: number, event: MouseEvent): void {
    if (event.detail !== 0) {
      return;
    }
    this.emitRailFill(kind, index);
  }

  /** Ends any in-progress rail sweep — bound to a document-level mouseup in the template. */
  protected onRailSweepEnd(): void {
    this.railSweeping = false;
  }

  private emitRailFill(kind: 'row' | 'col', index: number): void {
    if (kind === 'row') {
      this.rowRailFill.emit(index);
    } else {
      this.colHeaderFill.emit(index);
    }
  }
}
