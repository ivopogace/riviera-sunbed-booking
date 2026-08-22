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
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';

import { BeachGridFrame } from './beach-grid-frame';

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
 * The shared beach-map canvas (#672): everything the tourist map, the layout editor, the
 * Daily view and the per-set editor repeat around their tiles — the {@link BeachGridFrame}
 * chrome, the sea→sand wash
 * on the vertical scroller, the aria-hidden row-code and per-zone price rails, the zone-gap
 * layout, and the pannable viewport (2D mouse drag + horizontal scroll snap + edge fade, the
 * horizontal chrome gated on actual overflow via `.pannable`). Three content slots ride along:
 * `canvasLegend` above the grid, `canvasFooter` below it, and `canvasEmpty` in place of both —
 * all optional, because their content is per-surface (the tile legend is tourist-only, #701).
 * The wash's sea-end colour is published as `--riv-map-sea` on the host, so projected content —
 * the tourist legend band — can sit on the same ground the top tile row does without copying the
 * literal (custom properties inherit into projected content, as `--riv-tile` already relies on).
 * A drag pans horizontally via
 * the viewport's `scrollLeft` and — whenever the wash scroller actually overflows — vertically
 * via its `scrollTop`; on a short map the vertical axis stays inert, so a sloppy tap never
 * loses its click. Tile rows are projected via
 * {@link BeachMapRowDef}, so each surface keeps its own tile vocabulary and interaction —
 * the canvas shares the chrome, never the behavior.
 *
 * <p>While {@link BeachMapCanvas#loading} the same chrome draws a placeholder: the rail chips carry
 * no text, the grab cursor is withheld and the pan hint renders `invisible` (an `inert` skeleton can
 * honour neither cue, but the hint's line stays reserved so the card does not grow by it on load),
 * and the decorative testids are renamed so a spec cannot query a placeholder as the real thing. The
 * measured `.pannable` edge fade stays — it reports a fact rather than inviting an action (#749).
 *
 * <p>A drag past the 6px threshold on either axis is a pan: the canvas swallows the one
 * pointer click that ends it (capture phase, consume-once) so a pan release never activates
 * a tile, while a keyboard activation (`detail === 0`) is never swallowed. A surface whose
 * mouse-drag gesture
 * means something else (the editor paints by drag) opts out via `dragPan` — native touch and
 * trackpad scrolling still work. The rails are aria-hidden by design: every surface's tile
 * accessible names already carry the row and (where it matters) the price.
 */
@Component({
  selector: 'app-beach-map-canvas',
  imports: [BeachGridFrame, NgTemplateOutlet],
  templateUrl: './beach-map-canvas.html',
  host: { class: 'block', style: '--riv-tile: clamp(47px, 11vw, 56px); --riv-map-sea: #cfeef6' },
})
export class BeachMapCanvas {
  /** A drag that travels beyond this many pixels is a pan, not a tap. */
  private static readonly PAN_THRESHOLD_PX = 6;

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
  /** What the rail's chips are — and therefore how much width the rail reserves, in BOTH the
   *  loading and the loaded state (#749). `letters` is a grid being painted (the two editor
   *  surfaces): chips are one or two characters, so the rail reserves nothing beyond the chip's
   *  own `min-w-6`. `labels` is the stored per-venue row name (#724): the rail reserves a
   *  MINIMUM, so a longer name still widens it and renders whole — the operator rule. The
   *  tourist map's `capped-labels` ellipsizes on top of that reservation (#724), which is what
   *  makes its phone rail the one that cannot move at all. */
  readonly railCodes = input<'letters' | 'labels' | 'capped-labels'>('letters');
  /** Draw a placeholder grid, not a map: the rails reserve their columns but state nothing, and
   *  every cue that invites a gesture is withheld (#749). A surface renders its skeleton THROUGH
   *  the canvas to inherit `--riv-tile` and the frame geometry, which also inherits this chrome —
   *  so the canvas, not the surface, is what has to know the difference. */
  readonly loading = input<boolean>(false);

  /**
   * The rail's width, reserved rather than derived from whatever the read happened to return.
   *
   * <p>A content-derived rail is a horizontal version of the vertical jump the skeletons removed:
   * the placeholder's chip is one width, the real label another, and the whole tile grid slides on
   * load (measured at 24 → 63.14px, #749). Reserving in the loading state alone only reverses the
   * direction — a venue whose rows are named `A` would then slide the grid LEFT — so the
   * reservation belongs to the vocabulary, not to the loading flag, and applies in both states.
   *
   * <p><strong>A minimum, and 54px of one, because the rail is spending the tile grid's width.</strong>
   * Reserving the #724 cap outright (102px from `sm`) would pin the rail at its worst case and end
   * the slide entirely — but measured against the fits-whole guarantee it costs 39px the desktop
   * map does not have: a 14-column venue clears its viewport by ~31px, and the cap-sized rail put
   * it into a pan. 54px is the mobile cap (48px of text + the chip's 6px), which leaves ~13px of
   * that margin, holds the phone rail exactly where it lands today, and cuts the slide from
   * 39.14px to 9.14px everywhere else. The residual is a label wider than the reservation, which
   * only a measurement of the loaded map could predict.
   */
  protected readonly railColumnClass = computed(() =>
    this.railCodes() === 'letters' ? '' : 'min-w-[54px]',
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

  /**
   * Scrollbar chrome for both scrollers — the horizontal pan viewport and the vertical wash. A
   * drag-pan surface asks for no bar on each: the drag IS the affordance, and the hint below the map
   * names it. A surface that opted out of drag-pan has no pointer gesture left, so both show a slim
   * themed bar instead: without one, a plain mouse could only reach off-screen tiles through
   * shift+wheel, which nothing on screen advertises.
   *
   * <p>Asks, not guarantees: `scrollbar-none` sets only `scrollbar-width`, so an engine without it
   * (Safari before 18.2) paints its native bar on a drag-pan surface regardless.
   *
   * <p>Both axes, not just the pan viewport: the hint fires on either overflow, so a wash that
   * scrolls behind a hidden bar would have it naming an affordance that surface does not have.
   *
   * <p>No `scrollbar-gutter`: the pan viewport is `overflow-y: hidden`, so a stable gutter reserves
   * an inline-end strip for a vertical bar that can never appear — measured at 10px of grid width —
   * and reserves nothing for the horizontal bar it was meant to stabilise.
   */
  protected readonly scrollbarChrome = computed(() =>
    this.dragPan()
      ? 'scrollbar-none'
      : 'scrollbar-thin scrollbar-thumb-(--riv-accent-ink) scrollbar-track-transparent',
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

  /** Read both overflow axes from the live DOM; every piece of pan chrome is gated on this. */
  private measureOverflow(): void {
    const el = this.panViewport()?.nativeElement;
    const grid = this.rowGrid()?.nativeElement;
    this.scrollHint.set(!!el && !!grid && BeachMapCanvas.contentWidth(grid) > el.clientWidth + 1);
    this.vScrollHint.set(BeachMapCanvas.overflowsVertically(this.washScroller()?.nativeElement));
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

  protected onViewportMouseDown(event: MouseEvent): void {
    const el = this.panViewport()?.nativeElement;
    if (!el || !this.dragPan()) {
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
}
