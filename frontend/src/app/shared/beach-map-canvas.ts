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
 * no text, and the pan hint and grab cursor are withheld — an `inert` skeleton can honour neither.
 * The decorative testids are renamed so a spec cannot query a placeholder as the real thing. The
 * measured `.pannable` edge fade stays: it reports a fact rather than inviting an action (#749).
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
  imports: [BeachGridFrame, NgTemplateOutlet, TouchTarget],
  templateUrl: './beach-map-canvas.html',
  host: {
    class: 'block',
    style: '--riv-map-sea: #cfeef6',
    '[style.--riv-tile]': 'tileSizeStyle()',
    '(document:mouseup)': 'onRailSweepEnd()',
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
  /** What the rail's chips are — and therefore how much width the rail reserves, in BOTH the
   *  loading and the loaded state (#749). `letters` is a grid being painted (the two editor
   *  surfaces): chips are one or two characters, so the rail reserves nothing beyond the chip's
   *  own `min-w-6`. `labels` is the stored per-venue row name (#724): the rail reserves a
   *  MINIMUM, so a longer name still widens it and renders whole — the operator rule. The
   *  tourist map's `capped-labels` ellipsizes on top of that reservation (#724), which is what
   *  makes its phone rail the one that cannot move at all. */
  readonly railCodes = input<'letters' | 'labels' | 'capped-labels'>('letters');
  /** What the price rail's chips are — and therefore how much width THAT rail reserves, in both
   *  the loading and the loaded state (#751). `amounts` is a formatted amount or a min–max span
   *  (every operator surface): the rail reserves nothing beyond the cell's own 52px floor, which
   *  an amount fits at 41px. A span does not — `€125–€9,995` measures 96.58px — so this
   *  vocabulary keeps a bounded residual **by choice**: reserving for the worst span would spend
   *  40px of every operator grid on a chip that is 41px wide in the ordinary venue.
   *  `capped-phrases` is a price plus what it buys (#702, narrowed by #724 — the tourist map
   *  alone), where the qualifier makes the wide case the ordinary one: that rail reserves the
   *  92px phone cap. Distinct from {@link railCodes} on purpose — the two rails' vocabularies are
   *  separate questions, and the Daily view already answers them differently (whole labels, bare
   *  amounts). */
  readonly priceChips = input<'amounts' | 'capped-phrases'>('amounts');
  /** Draw a placeholder grid, not a map: the rails reserve their columns but state nothing, and
   *  every cue that invites a gesture is withheld (#749). A surface renders its skeleton THROUGH
   *  the canvas to inherit `--riv-tile` and the frame geometry, which also inherits this chrome —
   *  so the canvas, not the surface, is what has to know the difference. */
  readonly loading = input<boolean>(false);
  /**
   * Size tiles to the viewport's actual width instead of the default viewport-relative clamp
   * (#709) — the two operator editor surfaces (bulk paint + per-set) opt in, so a typical venue
   * renders whole at desktop widths with no drag-panning; the tourist map and the Daily view keep
   * the original clamp untouched. Tiles shrink as low as the {@link FIT_MIN_TILE_PX} touch-target
   * floor before the grid genuinely overflows and panning resumes — same posture as the default
   * mode, just measured instead of guessed from viewport width.
   */
  readonly fitWidth = input<boolean>(false);

  /**
   * Turns the row-code rail (#713) from a decorative `aria-hidden` chip into a real,
   * individually-labelled fill button per row — a whole-row accelerator for the layout
   * editor's paint brushes. Off by default, so the tourist map, Daily view, and the
   * per-set editor keep today's decorative rail byte-for-byte.
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
  protected readonly railColumnClass = computed(() => {
    // A fill button needs the 44px floor in both axes, not just the chip's min-w-6 (#713).
    if (this.rowRailInteractive()) {
      return 'min-w-11';
    }
    return this.railCodes() === 'letters' ? '' : 'min-w-[54px]';
  });

  /**
   * The price rail's width, reserved on the same terms and for the same defect as
   * {@link railColumnClass} — this is that defect's trailing-edge half.
   *
   * <p>A bare amount (40.97px) already fits the cell's `min-w-[52px]`, so what varies is only the
   * qualifier or a four-digit price: the rail measures 52px while loading and up to its 92/128px
   * cap once the read lands, and the tile viewport narrows from the right by the difference. No
   * tile moves — the rail is at the trailing edge — but a map that showed six columns finishes
   * showing five.
   *
   * <p><strong>92px, and a minimum, because the fits-whole guarantee is what pays for it.</strong>
   * A 14-column venue at 1280 leaves this rail ~125.6px before that map has to pan, and 92px is
   * the phone cap: so on a phone the rail cannot move at all (cap and reservation are one number),
   * on a desktop the residual is at most `chip − 92`, and the venue that actually pays — bare
   * amounts, 14 columns — keeps 34px of that margin. The cap itself is untouched; this sits under
   * it as a floor.
   */
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
    const fitted = this.fittedTilePx();
    return this.fitWidth() && fitted !== null ? `${fitted}px` : BeachMapCanvas.DEFAULT_TILE;
  });

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

  /**
   * A {@link fitWidth} surface's ideal tile size: the viewport's own width (independent of tile
   * size — `flex-1 min-w-0` sizes it from its siblings, not its content, so this converges in one
   * extra render rather than feeding back into itself) divided across {@link mapCols} tiles and
   * their gaps, clamped to the fit range. `null` while {@link fitWidth} is off or unmeasured.
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

  /** A plain click (keyboard activation, or a press-and-release with no drag) fills once. */
  protected onRailClick(kind: 'row' | 'col', index: number): void {
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
