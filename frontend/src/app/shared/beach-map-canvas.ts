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
  /** The rail chip's row code (`A`, `B`, … `AA`). Must be unique per map (used as track key). */
  readonly code: string;
  /** The zone chip's text; `null` renders no chip even on a zone start. */
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
 * horizontal chrome gated on actual overflow via `.pannable`). A drag pans horizontally via
 * the viewport's `scrollLeft` and — whenever the wash scroller actually overflows — vertically
 * via its `scrollTop`; on a short map the vertical axis stays inert, so a sloppy tap never
 * loses its click. Tile rows are projected via
 * {@link BeachMapRowDef}, so each surface keeps its own tile vocabulary and interaction —
 * the canvas shares the chrome, never the behavior.
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
  host: { class: 'block', style: '--riv-tile: clamp(47px, 11vw, 56px)' },
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
    // Re-measure the pan overflow per render (jsdom reads 0 — the hint is proven in e2e).
    afterRenderEffect(() => {
      this.rows();
      this.measureOverflow();
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
