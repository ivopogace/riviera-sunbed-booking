import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  contentChild,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  signal,
  TemplateRef,
  untracked,
} from '@angular/core';

import { BeachGridFrame } from './beach-grid-frame';
import { ChevronDownIcon } from './chevron-down-icon';
import { TouchTarget } from './touch-target';

/** One set at overview scale: a key into the surface's own looks, plus an optional ring colour. */
export interface BeachRowLensCell {
  /** Which of the surface's {@link BeachRowLens.looks} this cell wears. */
  readonly state: string;
  /** A CSS colour drawn as a ring around the cell (a plan's stretch), or none. */
  readonly ring?: string | null;
}

/** A zone's band: `title` leads (a price), `note` follows in softer ink (a count). */
export interface BeachRowLensBand {
  readonly title: string;
  readonly note: string;
}

/**
 * The lens's per-row contract. Each surface passes its own richer rows; the lens reads these
 * fields and hands the whole object back to the projected tile template of the open row.
 */
export interface BeachRowLensRow {
  /** The row's identity, unique per map: the chip's text and the open-state key. */
  readonly code: string;
  /** True where this row starts a zone; with {@link band} it draws the band above the row. */
  readonly zoneStart: boolean;
  readonly band: BeachRowLensBand | null;
  /** The row's sets in column order. */
  readonly cells: readonly BeachRowLensCell[];
  /** Short text for the closed row's empty columns, shown only where the row leaves room. */
  readonly note: string | null;
  /** The open row's head text, used when the zone's band is not this row's alone. */
  readonly summary: string;
  /** Accessible name of the closed row's button and of the open row's group. */
  readonly label: string;
  /** Accessible name of the open row's close control. */
  readonly closeLabel: string;
  /** The tile the open row must show when it opens; the lens pans only if it is out of view. */
  readonly panTo: { readonly index: number; readonly align: 'start' | 'center' } | null;
  /** The index of a tile wearing a badge that overhangs it. When it changes to a tile, and on a
   *  resize, the open row scrolls by the least that shows it whole with room for the badge; on
   *  opening that is after the pan to `panTo`, so name the same tile or one beside it. */
  readonly keepWhole?: number | null;
}

/** The projected tile template's context: the surface's own row object plus its index. */
export interface BeachRowLensContext<R extends BeachRowLensRow> {
  readonly $implicit: R;
  readonly index: number;
}

/**
 * Declares the open row's tile template and carries the rows the lens renders:
 * `<ng-template [appBeachRowLensTiles]="rows()" let-row>`. The template renders ONE root element
 * whose children are the row's tiles in cell order; `panTo` and `keepWhole` index them.
 */
@Directive({ selector: 'ng-template[appBeachRowLensTiles]' })
export class BeachRowLensTilesDef<R extends BeachRowLensRow = BeachRowLensRow> {
  readonly appBeachRowLensTiles = input.required<readonly R[]>();
  readonly template = inject<TemplateRef<BeachRowLensContext<R>>>(TemplateRef);

  static ngTemplateContextGuard<R extends BeachRowLensRow>(
    _dir: BeachRowLensTilesDef<R>,
    _ctx: unknown,
  ): _ctx is BeachRowLensContext<R> {
    return true;
  }
}

/**
 * One overview cell's box, worn by the lens's cells and by a surface's legend swatches alike. Every
 * shape a look draws is a real `border` in `currentColor` (the edge here, a strike, dot or fill on
 * `::after`), because forced colours drop backgrounds and shadows. The box is a size container, so
 * a look sizes its shape in `cqw` and it scales with the cell.
 */
@Directive({
  selector: '[appBeachLensCell]',
  host: {
    class:
      'relative block aspect-square min-w-0 overflow-hidden rounded-[4px] border-[1.5px] border-current [container-type:inline-size]',
    '[class]': 'look()',
  },
})
export class BeachLensCell {
  /** The surface's class string for this cell's state. */
  readonly look = input.required<string>();
}

/** A zone band's chip: the title in rail ink, the note beside it in softer ink. */
@Component({
  selector: 'app-beach-lens-band',
  host: { class: 'contents' },
  template: `<span
    class="inline-flex max-w-full items-center gap-1.5 rounded-full border border-riv-map-chip-border bg-riv-map-chip-fill px-2 text-[12px] leading-[18px] font-bold text-riv-map-rail-ink"
    data-testid="lens-band"
    ><span class="truncate" data-testid="lens-band-title">{{ band().title }}</span
    ><span
      class="font-semibold whitespace-nowrap text-riv-card-ink-soft"
      data-testid="lens-band-note"
      >· {{ band().note }}</span
    ></span
  >`,
})
export class BeachLensBand {
  readonly band = input.required<BeachRowLensBand>();
}

/** Which edges of a sideways scroller still hide content. */
type Fade = 'none' | 'end' | 'both' | 'start';

const FADE_CLASS: Record<Fade, string> = {
  none: '',
  end: '[mask-image:linear-gradient(90deg,black_calc(100%-20px),transparent)]',
  both: '[mask-image:linear-gradient(90deg,transparent,black_20px,black_calc(100%-20px),transparent)]',
  start: '[mask-image:linear-gradient(90deg,transparent,black_20px)]',
};

function fadeOf(el: HTMLElement): Fade {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 1) {
    return 'none';
  }
  if (el.scrollLeft <= 2) {
    return 'end';
  }
  return el.scrollLeft >= max - 2 ? 'start' : 'both';
}

/** A lens row as rendered: the surface's row plus what the template would otherwise recompute. */
interface LensRowView<R extends BeachRowLensRow> {
  readonly row: R;
  readonly index: number;
  readonly open: boolean;
  /** The zone's band is this row's alone, so the open row's head carries it. */
  readonly solo: boolean;
  /** The 1-based grid column the closed row's note starts at, or `null` for no note. */
  readonly noteColumn: number | null;
}

/**
 * The beach map as a row lens: every row a full-width button drawn at overview scale, and the open
 * row(s) inline as the surface's own tiles. Surface-agnostic like `BeachMapCanvas`: it knows rows,
 * cells and looks, never what a state means. Cells share one column grid and shrink to a 12px
 * floor; past it every closed row pans sideways in step under a position bar, and follows the open
 * row's pan. The page scrolls vertically; the lens never does.
 */
@Component({
  selector: 'app-beach-row-lens',
  imports: [
    BeachGridFrame,
    BeachLensBand,
    BeachLensCell,
    ChevronDownIcon,
    NgTemplateOutlet,
    TouchTarget,
  ],
  templateUrl: './beach-row-lens.html',
  host: { class: 'block' },
})
export class BeachRowLens {
  /** Columns from which the overview packs tighter: a 2px gap and a smaller radius. */
  private static readonly DENSE_COLS = 14;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Accessible name for the frame section (e.g. "Beach map — Miramar"). */
  readonly label = input<string>('');
  /** The frame section's `data-testid`. */
  readonly frameTestid = input<string>('beach-grid');
  /** How each of the surface's state keys looks at overview scale: a class string per key. */
  readonly looks = input.required<Readonly<Record<string, string>>>();
  /** The codes of the open rows. The surface decides the default; the lens writes user toggles. */
  readonly open = model<readonly string[]>([]);
  /** Bump it to pan every open row to its `panTo` again, as when the rows are re-read for other
   *  days: a row pans once per opening, and a row that merely stays open keeps the user's scroll. */
  readonly panAgain = input<number>(0);
  /** Let several rows stay open at once; off, opening a row closes the other. */
  readonly multiOpen = input<boolean>(false);
  /** Which tile takes focus when the user opens a row with no `panTo` tile; else its close control. */
  readonly focusOnOpen = input<string>('button');

  protected readonly rowsDef = contentChild.required<BeachRowLensTilesDef>(BeachRowLensTilesDef);
  protected readonly rows = computed<readonly BeachRowLensRow[]>(() =>
    this.rowsDef().appBeachRowLensTiles(),
  );

  /** Uniform column count, so a narrower row lines up under the widest row's columns. */
  protected readonly cols = computed(() => Math.max(1, ...this.rows().map((r) => r.cells.length)));
  protected readonly dense = computed(() => this.cols() >= BeachRowLens.DENSE_COLS);
  protected readonly gridColumns = computed(() => `repeat(${this.cols()}, minmax(12px, 1fr))`);
  /** Every column at the 12px floor plus the gaps: what a row is never narrower than. */
  protected readonly gridMinWidth = computed(
    () => this.cols() * 12 + (this.cols() - 1) * (this.dense() ? 2 : 3),
  );

  /** True while the overview is wider than a closed row: the block pans and the bar shows. */
  protected readonly overflowing = signal(false);
  /** The overview's shared sideways offset, in px. */
  private readonly offset = signal(0);
  /** A closed row's visible overview width and the width of all its columns, in px. */
  private readonly overviewWidth = signal(0);
  private readonly overviewContent = signal(0);
  protected readonly overviewFade = signal<Fade>('none');

  protected readonly view = computed<readonly LensRowView<BeachRowLensRow>[]>(() => {
    const rows = this.rows();
    const open = new Set(this.open());
    const cols = this.cols();
    const room = this.dense() ? 5 : 3;
    return rows.map((row, index) => {
      const solo = row.zoneStart && (index === rows.length - 1 || rows[index + 1].zoneStart);
      const spare = cols - row.cells.length;
      return {
        row,
        index,
        open: open.has(row.code),
        solo,
        noteColumn: row.note && spare >= room && !this.overflowing() ? row.cells.length + 1 : null,
      };
    });
  });
  protected readonly anyOpen = computed(() => this.view().some((v) => v.open));

  /** The 1-based columns in view while the overview pans: the position bar's text and thumb. */
  protected readonly columnsInView = computed(() => {
    const cols = this.cols();
    const pitch = this.overviewContent() / cols;
    if (!this.overflowing() || pitch <= 0) {
      return { first: 1, last: cols };
    }
    const first = Math.min(cols, Math.floor(this.offset() / pitch + 0.25) + 1);
    const last = Math.min(cols, Math.floor((this.offset() + this.overviewWidth()) / pitch + 0.25));
    return { first, last: Math.max(first, last) };
  });
  protected readonly thumbLeft = computed(
    () => ((this.columnsInView().first - 1) / this.cols()) * 100,
  );
  protected readonly thumbWidth = computed(() => {
    const { first, last } = this.columnsInView();
    return ((last - first + 1) / this.cols()) * 100;
  });

  protected fadeClass(fade: Fade): string {
    return FADE_CLASS[fade];
  }

  /** Rows whose opening pan has been applied, with the `keepWhole` last seen; a row leaves when it closes. */
  private readonly panned = new Map<string, number | null>();
  /** The {@link panAgain} value the open rows were last panned for. */
  private pannedFor = 0;
  /** Offsets the lens wrote to closed rows, whose scroll events are echoes, not a finger. */
  private readonly echoes = new WeakMap<HTMLElement, number>();

  constructor() {
    afterRenderEffect({
      write: () => {
        this.view();
        this.panAgain();
        untracked(() => {
          this.startPans();
          this.measure();
          this.syncOverview(this.offset());
        });
      },
    });

    // A resize changes the fit without changing rows, which the render effect cannot see.
    effect((onCleanup) => {
      // jsdom has no ResizeObserver; the spec stubs the geometry and the e2e drives the real one.
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      let width = -1;
      const observer = new ResizeObserver(([entry]) => {
        // Only a change of width can cut a tile; opening a row changes the height alone.
        if (entry.contentRect.width !== width) {
          width = entry.contentRect.width;
          this.keepWholeTiles();
        }
        this.measure();
        this.syncOverview(this.offset());
      });
      observer.observe(this.host.nativeElement);
      onCleanup(() => observer.disconnect());
    });
  }

  private overviewScrollers(): HTMLElement[] {
    return [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-lens-cells]')];
  }

  private openRowEl(code: string): HTMLElement | null {
    return (
      [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-lens-open]')].find(
        (el) => el.dataset['lensOpen'] === code,
      ) ?? null
    );
  }

  /** Read the overview's fit from any closed row; every piece of pan chrome is gated on it. */
  private measure(): void {
    const scroller = this.overviewScrollers()[0];
    if (scroller) {
      this.overviewWidth.set(scroller.clientWidth);
      this.overviewContent.set(scroller.scrollWidth);
      this.overflowing.set(scroller.scrollWidth > scroller.clientWidth + 1);
      this.overviewFade.set(fadeOf(scroller));
    }
  }

  /** Pan a freshly opened row to its {@link BeachRowLensRow.panTo} tile, once per opening, and
   *  bring a newly named {@link BeachRowLensRow.keepWhole} tile in; nothing else moves an open row. */
  private startPans(): void {
    if (this.panAgain() !== this.pannedFor) {
      this.pannedFor = this.panAgain();
      this.panned.clear();
    }
    const open = this.view().filter((v) => v.open);
    for (const code of [...this.panned.keys()]) {
      if (!open.some((v) => v.row.code === code)) {
        this.panned.delete(code);
      }
    }
    for (const { row } of open) {
      const fresh = !this.panned.has(row.code);
      const whole = row.keepWhole ?? null;
      if (!fresh && this.panned.get(row.code) === whole) {
        continue;
      }
      this.panned.set(row.code, whole);
      const pan = this.openRowEl(row.code)?.querySelector<HTMLElement>('[data-lens-pan]');
      if (!pan) {
        continue;
      }
      const before = pan.scrollLeft;
      if (fresh) {
        const tile = this.panTile(pan, row);
        if (tile && row.panTo && tile.offsetLeft + tile.offsetWidth > pan.clientWidth) {
          pan.scrollLeft =
            row.panTo.align === 'center'
              ? tile.offsetLeft - (pan.clientWidth - tile.offsetWidth) / 2
              : tile.offsetLeft - this.sideRoom(pan);
        } else if (pan.scrollLeft !== 0) {
          // A row panned again in place keeps its old scroll: position 1 shows its tile, or it has none.
          pan.scrollLeft = 0;
        }
      }
      this.bringIn(pan, row);
      // The overview is the user's to pan while the open row stands still.
      if (fresh || pan.scrollLeft !== before) {
        this.follow(pan, row);
      }
    }
  }

  /** The tile element a row's {@link BeachRowLensRow.panTo} names, inside its pan viewport. */
  private panTile(pan: Element, row: BeachRowLensRow): HTMLElement | null {
    return row.panTo ? (this.tiles(pan)[row.panTo.index] ?? null) : null;
  }

  /** The surface's tiles in a pan viewport: the children of the one list its template renders. */
  private tiles(pan: Element): HTMLElement[] {
    return [...(this.list(pan)?.children ?? [])].filter((el) => el instanceof HTMLElement);
  }

  private list(pan: Element): Element | null {
    return pan.querySelector('[data-lens-track]')?.firstElementChild ?? null;
  }

  /** The track's room for a badge at each end: where its first tile starts. */
  private sideRoom(pan: Element): number {
    const first = this.list(pan)?.firstElementChild;
    return first instanceof HTMLElement ? first.offsetLeft : 0;
  }

  /** A resize can cut a tile that was whole: every open row's named tile is brought in again. */
  private keepWholeTiles(): void {
    for (const { row, open } of this.view()) {
      const pan = open && this.openRowEl(row.code)?.querySelector<HTMLElement>('[data-lens-pan]');
      if (pan) {
        this.bringIn(pan, row);
      }
    }
  }

  /** Scroll by the least that shows a row's {@link BeachRowLensRow.keepWhole} tile whole, the
   *  track's side room beside it for its badge. */
  private bringIn(pan: HTMLElement, row: BeachRowLensRow): void {
    const tile = typeof row.keepWhole === 'number' ? this.tiles(pan)[row.keepWhole] : undefined;
    if (!tile) {
      return;
    }
    const room = this.sideRoom(pan);
    const left = tile.offsetLeft - pan.scrollLeft;
    const over = left + tile.offsetWidth - (pan.clientWidth - room);
    if (over > 0) {
      pan.scrollLeft += over;
    } else if (left < room) {
      pan.scrollLeft -= room - left;
    }
  }

  /** Move every closed row to one offset. Only a scroller that differs is written, and each write
   *  is remembered so its scroll event is not taken for the user's. */
  private syncOverview(offset: number, source?: HTMLElement): void {
    for (const scroller of this.overviewScrollers()) {
      if (scroller !== source && Math.abs(scroller.scrollLeft - offset) > 1) {
        this.echoes.set(scroller, offset);
        scroller.scrollLeft = offset;
      }
    }
  }

  protected onOverviewScroll(event: Event): void {
    const scroller = event.currentTarget as HTMLElement;
    this.overviewFade.set(fadeOf(scroller));
    const echo = this.echoes.get(scroller);
    this.echoes.delete(scroller);
    // An echo of the lens's own write: acting on it could pull the row under the finger back a frame.
    if (echo !== undefined && Math.abs(scroller.scrollLeft - echo) <= 1) {
      return;
    }
    this.offset.set(scroller.scrollLeft);
    this.syncOverview(scroller.scrollLeft, scroller);
  }

  protected onOpenPan(event: Event, row: BeachRowLensRow): void {
    const pan = event.currentTarget as HTMLElement;
    this.follow(pan, row);
    this.measure();
  }

  /** The panned overview follows the open row, so the columns being picked from stay in view. */
  private follow(pan: HTMLElement, row: BeachRowLensRow): void {
    const scroller = this.overviewScrollers()[0];
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth + 1) {
      return;
    }
    // An unmeasured or empty open row has no tile pitch to read a column from.
    if (pan.scrollWidth === 0 || row.cells.length === 0) {
      return;
    }
    const room = this.sideRoom(pan);
    const tilePitch = (pan.scrollWidth - 2 * room) / row.cells.length;
    const column = (pan.scrollLeft + pan.clientWidth / 2 - room) / tilePitch;
    const columnPitch = scroller.scrollWidth / this.cols();
    const max = scroller.scrollWidth - scroller.clientWidth;
    const offset = Math.max(0, Math.min(max, column * columnPitch - scroller.clientWidth / 2));
    this.offset.set(offset);
    this.syncOverview(offset);
  }

  /** Open a row where it stands: the page is scrolled back by whatever the change moved it. */
  protected openRow(code: string, button: EventTarget | null): void {
    const top = button instanceof HTMLElement ? button.getBoundingClientRect().top : null;
    this.open.update((open) => (this.multiOpen() ? [...open, code] : [code]));
    afterNextRender(
      {
        write: () => {
          const row = this.openRowEl(code);
          if (!row) {
            return;
          }
          const moved = top === null ? 0 : row.getBoundingClientRect().top - top;
          if (Math.abs(moved) >= 1) {
            globalThis.scrollBy(0, moved);
          }
          // The tile the row pans to is the one in view: focus there, not on a tile scrolled away.
          const pan = row.querySelector('[data-lens-pan]');
          const data = this.rows().find((r) => r.code === code);
          const tile = pan && data ? this.panTile(pan, data) : null;
          const target =
            (tile?.matches('button') ? tile : tile?.querySelector<HTMLElement>('button')) ??
            row.querySelector<HTMLElement>(`[data-lens-pan] :is(${this.focusOnOpen()})`) ??
            row.querySelector<HTMLElement>('[data-lens-close]');
          target?.focus({ preventScroll: true });
        },
      },
      { injector: this.injector },
    );
  }

  /** Close a row and hand focus back to its button (WCAG 2.4.3: the close control is destroyed). */
  protected closeRow(code: string): void {
    this.open.update((open) => open.filter((c) => c !== code));
    afterNextRender(
      {
        write: () => {
          [...this.host.nativeElement.querySelectorAll<HTMLElement>('[data-lens-row]')]
            .find((el) => el.dataset['lensRow'] === code)
            ?.focus({ preventScroll: true });
        },
      },
      { injector: this.injector },
    );
  }
}
