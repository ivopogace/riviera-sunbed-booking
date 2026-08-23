import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { ConfirmPanel } from '../shared/confirm-panel';
import { focusMover } from '../shared/focus-after-render';
import { formatMoney, MoneyView } from '../shared/money';
import { parentVenueId } from '../shared/parent-venue-id';
import {
  BeachCell,
  CELL_STATE_DESC,
  CellState,
  cellStateOf,
  clampGrid,
  gridRowLabel,
  MAX_COLS,
  MAX_ROWS,
} from './beach-cell';
import { BeachMapCanvas, BeachMapCanvasRow, BeachMapRowDef } from '../shared/beach-map-canvas';
import { todayBookingDate } from '../shared/booking-date';
import { SetView } from '../shared/venue-views';
import { VenueService } from '../venue/venue.service';
import { ConsoleVenueMap } from './console-venue-map';
import { LayoutCellRequest, LayoutErrorCode, RowNameErrorCode } from './operator-console.model';
import { OperatorConsoleService, layoutErrorOf, rowNameErrorOf } from './operator-console.service';
import { SetEditor } from './set-editor';
import { StaleWriteBanner } from './stale-write-banner';

import { TouchTarget } from '../shared/touch-target';

/** Which editing surface the tab is showing: the whole-map replace, or one set at a time. */
type EditorMode = 'bulk' | 'sets';

/** A tool-rail row: Select (arms {@link EditorMode} `'sets'`) or one of the four paint brushes
 *  (arms `'bulk'` with that brush active). */
type EditorTool = 'select' | CellState;

/** One paint-grid row on the shared canvas's row contract, plus the cells the editor paints. */
interface LayoutRow extends BeachMapCanvasRow {
  readonly cells: readonly { readonly state: CellState; readonly label: string }[];
}

/** One tool-rail row: Select carries no count, a brush carries its live cell count. */
interface ToolRow {
  readonly key: EditorTool;
  readonly label: string;
  readonly count: number | null;
  readonly active: boolean;
}

const PREMIUM_PRICE: MoneyView = { minorUnits: 3500, currency: 'EUR' };
const STANDARD_PRICE: MoneyView = { minorUnits: 2000, currency: 'EUR' };

/** The tool rail's fixed design order — Select first, then the four paint brushes. */
const TOOL_ORDER: readonly EditorTool[] = ['select', 'premium', 'standard', 'walkin', 'gap'];

const TOOL_LABEL: Record<CellState, string> = {
  premium: 'Front row · premium',
  standard: 'Standard set',
  walkin: 'Walk-in pool',
  gap: 'Gap / aisle',
};

/** Per-tool swatch background classes (mirrors the cell variants, sized by the swatch element). */
const SWATCH_CLASS: Record<CellState, string> = {
  premium: 'bg-[linear-gradient(180deg,#ffe3a3,#f4c05a)]',
  standard: 'bg-white/85',
  walkin:
    'bg-[repeating-linear-gradient(45deg,rgba(12,42,51,0.35)_0_3px,rgba(12,42,51,0.12)_3px_6px)]',
  gap: 'bg-transparent',
};

/**
 * The Beach-map tab — one canvas, one tool rail, because the venue's own lifecycle decides which
 * of two editing surfaces can work.
 *
 * <p>Arming a paint brush on the rail shows <strong>the bulk paint grid</strong>: an R×C grid
 * generated in one action (row A faces the sea, auto-priced front-row premium), tier/pool/gap
 * painted per cell by click or drag, saved through one owner-asserted `PUT …/beach-map`. That write
 * is reject-unless-unclaimed, so it works only while the venue has never been booked and carries no
 * hold dated today or later. A venue that has ever sold online answers `LAYOUT_IN_USE`
 * permanently; a walk-in-only venue whose marks are all history becomes replaceable again.
 *
 * <p>Arming Select shows <strong>{@link SetEditor}</strong> — what a live venue uses: the per-set U7
 * endpoints, which carry set-scoped claim guards instead of a venue-wide lock. The rail opens armed
 * on whichever tool the venue needs — Select once it has saved sets, the default brush while it is
 * empty — and the operator can override that; a per-set write makes this tab re-read the map and
 * drop the shared console snapshot, since the other tabs would otherwise render a set that no longer
 * exists. Select's own panel keeps its current placement — the docked-inspector merge is a later
 * slice, not this one.
 *
 * <p>Reads `:venueId` from the parent route (child routes don't inherit it). Cells are
 * real, individually-labelled `<button>`s so the grid is fully keyboard + AT operable (Enter/Space
 * paints with the active brush); drag-paint is the mouse affordance on top. Always porcelain
 * (inherited from the console shell); glass via {@link CardGlass}; money via {@link formatMoney}
 * (invariant #5 — the default prices are integer minor-unit EUR constants, editable later in the
 * Pricing tab).
 */
@Component({
  selector: 'app-layout-editor',
  imports: [
    CardGlass,
    BeachCell,
    BeachMapCanvas,
    BeachMapRowDef,
    ConfirmPanel,
    SetEditor,
    StaleWriteBanner,
    BusyAction,
    TouchTarget,
  ],
  templateUrl: './layout-editor.html',
  // Painting ends wherever the mouse is released — the grid container is canvas-owned now.
  host: {
    '(document:mouseup)': 'onPaintEnd()',
    '(document:mousedown)': 'onDocumentMouseDown($event)',
    '(document:touchmove)': 'onDocumentTouchMove($event)',
    '(document:touchend)': 'onPaintEnd()',
    '(document:touchcancel)': 'onPaintEnd()',
  },
})
export class LayoutEditor {
  private readonly route = inject(ActivatedRoute);
  private readonly venues = inject(VenueService);
  private readonly venueMap = inject(ConsoleVenueMap);
  private readonly console = inject(OperatorConsoleService);
  private readonly focusAfterRender = focusMover();
  protected readonly operator = inject(OperatorAuth);
  /** The bulk grid's canvas — read only for {@link BeachMapCanvas.panGestureActive} (#713), so a
   *  Space-drag pan at 100% zoom never also paints the cell it starts on. */
  private readonly canvas = viewChild(BeachMapCanvas);
  /** The tool-rail chips, in rail order — scrolled into view on arm so the armed tool is visible
   *  without the operator having to scroll the mobile chip strip manually (#715, mirrors #710). */
  private readonly toolChips = viewChildren<ElementRef<HTMLButtonElement>>('toolChip');

  /** The venue this editor manages, from the parent `/operator/:venueId` route (undefined if
   *  invalid) — reactive to in-place venue switches, which reuse this instance. */
  protected readonly venueId = parentVenueId(this.route);

  /** Generate inputs: rows × positions. Clamped to the design maxima on generate. */
  protected readonly genRows = signal(4);
  protected readonly genCols = signal(6);

  /** The current grid, row-major with row 0 sea-facing. Empty until generated or loaded. */
  protected readonly grid = signal<CellState[][]>([]);
  /**
   * The operator's name per grid row — what `row_label` saves as, so the tourist rail can
   * speak the venue's own words. Seeded with the loaded labels (or the grid letters on generate);
   * a blanked entry falls back to its grid letter at save time.
   */
  protected readonly rowNames = signal<readonly string[]>([]);
  /** The venue's saved sets from the last map read — what {@link SetEditor} edits, by id. */
  protected readonly loadedSets = signal<readonly SetView[]>([]);

  /**
   * The label each grid row carries **on the server** — the rename's source, and `undefined` for a
   * row with no saved sets. Only a stored row can be renamed; an unsaved one is created by the bulk
   * save, which writes its label anyway.
   */
  protected readonly storedRowNames = signal<readonly (string | undefined)[]>([]);
  /** The grid row whose rename is in flight, or null — drives `[appBusy]` on that row's button. */
  protected readonly renamingRow = signal<number | null>(null);
  /** The grid row whose rename last succeeded, cleared on the next edit of any row name. */
  protected readonly renamedRow = signal<number | null>(null);
  /** The last per-row rename failure. `STALE_WRITE` never lands here — the reload banner owns it. */
  protected readonly rowNameError = signal<{ y: number; code: RowNameErrorCode } | null>(null);
  /** The operator's explicit tool-rail choice, or null while the venue's own state decides. */
  private readonly armedTool = signal<EditorTool | null>(null);
  /** The brush painting will use once a brush is (re-)armed — survives arming Select, so
   *  switching back to painting resumes on the last brush rather than resetting to premium. */
  protected readonly activeBrush = signal<CellState>('premium');

  /** The grid as last loaded, reloaded or successfully saved — what {@link dirtyCount} diffs
   *  {@link grid} against, and what {@link discard} restores. */
  private readonly baselineGrid = signal<CellState[][]>([]);
  /** {@link rowNames} as last loaded, reloaded or successfully saved — {@link discard}'s other half. */
  private readonly baselineRowNames = signal<readonly string[]>([]);
  /** A one-line description of the latest paint/generate action, cleared by a successful save or a
   *  discard — the save bar's "what changed" line. */
  protected readonly lastChange = signal<string | null>(null);
  /** When the bulk grid was last saved successfully, or null if never. */
  protected readonly lastSavedAt = signal<Date | null>(null);

  /** True while the save PUT is in flight (button disabled, no double submit). */
  protected readonly saving = signal(false);
  /** Set after a successful save; cleared on the next edit. */
  protected readonly savedNotice = signal(false);
  /** The last write failure, mapped to operator-facing copy, or undefined. */
  protected readonly errorCode = signal<LayoutErrorCode | undefined>(undefined);
  /** True while awaiting confirmation of a destructive regenerate over an existing grid. */
  protected readonly confirmRegen = signal(false);
  /** The optimistic-concurrency token loaded with the map (`setVersion`), echoed back on Save; a
   *  `409 STALE_WRITE` means the layout moved on since — the editor keeps the grid and offers Reload. */
  protected readonly loadedSetVersion = signal<number | null>(null);
  /** True while a `reloadAfterStale()` GET is in flight (disables the Reload button, shows "Reloading…"). */
  protected readonly reloading = signal(false);
  /** True when the last Reload GET failed — the painted grid + stale token are kept, so surface a retry
   *  hint instead of silently leaving a blank editor (review finding: no data loss on a failed reload). */
  protected readonly reloadFailed = signal(false);
  /** True when the initial map read failed (no `setVersion` token loaded). Save cannot proceed without the
   *  token, so instead of a silent no-op the editor prompts a refresh (review finding). */
  protected readonly loadFailed = signal(false);
  /**
   * True once a map read has SUCCEEDED for this venue — i.e. `loadedSets` is what the server holds
   * rather than the empty default. {@link SetEditor} renders its skeleton until then, because a read
   * that has not landed says nothing about how many sets a venue has. Deliberately NOT cleared by
   * {@link onSetsChanged}'s re-read: that path keeps `loadedSets`, so the per-set surface must keep
   * rendering them instead of flashing a skeleton over every write.
   */
  protected readonly mapLoaded = signal(false);
  /**
   * True while a map read is in flight. Generate is shut for exactly that long, because until the
   * read lands `hasLayout()` is false for a venue that HAS a layout — and a regenerate then replaces
   * it with no confirmation, which a later Save writes over the real one with a token the resolving
   * read has quietly made valid. It covers both windows: the tab's own mount and
   * {@link onSetsChanged}'s re-read.
   */
  protected readonly reading = signal(false);

  /**
   * The tool actually armed on the rail: the operator's choice once made, otherwise the one the
   * venue needs — a venue with saved sets opens on Select (nothing to paint yet is misleading),
   * an empty one opens on the active brush.
   */
  protected readonly resolvedTool = computed<EditorTool>(
    () => this.armedTool() ?? (this.loadedSets().length > 0 ? 'select' : this.activeBrush()),
  );

  /** The surface the armed tool implies: Select opens the set-editor, any brush opens the paint grid. */
  protected readonly mode = computed<EditorMode>(() =>
    this.resolvedTool() === 'select' ? 'sets' : 'bulk',
  );

  /** Whether a grid exists (drives the empty-state vs the grid + save button). */
  protected readonly hasLayout = computed(() => this.grid().length > 0);

  /**
   * The read failed with nothing ever loaded, so the tab holds no map at all. The per-set surface is
   * not rendered in that state: it would read the empty `loadedSets` as "this venue has no sets yet"
   * and offer to add the first one, over a venue whose sets are simply unknown. A LATER read failing
   * is different — the surface keeps the sets it already has, and only the notice is new.
   */
  protected readonly mapUnavailable = computed(() => this.loadFailed() && !this.mapLoaded());

  /** The name each row saves with: the operator's trimmed words, or the row's grid letter. */
  private readonly effectiveRowNames = computed<readonly string[]>(() =>
    this.grid().map((_, y) => (this.rowNames()[y] ?? '').trim() || gridRowLabel(y)),
  );

  /** The first name two rows share, if any — blocked because the map and pricing tab group rows by label. */
  protected readonly duplicateRowName = computed<string | undefined>(() => {
    const seen = new Set<string>();
    for (const name of this.effectiveRowNames()) {
      if (seen.has(name)) {
        return name;
      }
      seen.add(name);
    }
    return undefined;
  });
  protected readonly genTotal = computed(
    () => clampGrid(this.genRows(), 1, MAX_ROWS) * clampGrid(this.genCols(), 1, MAX_COLS),
  );

  /** How many cells differ from {@link baselineGrid} — the save bar's unsaved-change count. A grid
   *  that grew (add row/col, regenerate) counts every new cell too: it genuinely is unsaved surface. */
  protected readonly dirtyCount = computed(() => {
    const current = this.grid();
    const base = this.baselineGrid();
    const rows = Math.max(current.length, base.length);
    let count = 0;
    for (let y = 0; y < rows; y++) {
      const currentRow = current[y] ?? [];
      const baseRow = base[y] ?? [];
      const cols = Math.max(currentRow.length, baseRow.length);
      for (let x = 0; x < cols; x++) {
        if ((currentRow[x] ?? 'gap') !== (baseRow[x] ?? 'gap')) {
          count++;
        }
      }
    }
    return count;
  });
  protected readonly isDirty = computed(() => this.dirtyCount() > 0);

  /** The save bar's last-saved line: the clock time in Tirane, or a not-yet-saved notice. */
  protected readonly lastSavedLabel = computed(() => {
    const at = this.lastSavedAt();
    return at === null ? 'Not saved yet' : `Last saved ${formatClockTime(at)}`;
  });

  /** Drag state — a plain field (not reactive; only the pointer handlers read it). */
  private painting = false;
  /** Bumped per venue context: an identity guard — a venueId value check passes again
   *  after an A→B→A switch, so continuations compare this instead. */
  private epoch = 0;

  /**
   * Prices of the sets loaded from the venue, keyed by `${gridX},${gridY}` — so a load→save round-trip
   * preserves each set's existing price instead of resetting it to the tier default (the Pricing
   * tab owns price editing). Newly generated cells have no entry and fall back to the tier
   * default. Mutated only alongside a `grid.set(...)`, so the `displayRows` computed reads it
   * consistently.
   */
  private readonly priceByCoord = new Map<string, MoneyView>();

  /**
   * The display rows on the shared canvas's contract. Every row is a zone of its own
   * (`zoneStart: true`): painting a tier re-prices a row live, and price-derived zones would
   * insert/remove zone gaps mid drag-gesture, shifting rows under the cursor — constant
   * per-row chips also keep the editor's per-row price display.
   */
  protected readonly displayRows = computed<readonly LayoutRow[]>(() =>
    this.grid().map((row, y) => ({
      code: gridRowLabel(y),
      priceLabel: this.rowPriceStr(row, y) || null,
      zoneStart: true,
      tileCount: row.length,
      cells: row.map((state, x) => ({
        state,
        label: `Row ${gridRowLabel(y)} position ${x + 1}, ${CELL_STATE_DESC[state]}`,
      })),
    })),
  );

  /** The tool rail: Select first, then the four paint brushes with live cell counts (design order). */
  protected readonly tools = computed<readonly ToolRow[]>(() => {
    const counts = this.counts();
    const resolved = this.resolvedTool();
    const select: ToolRow = {
      key: 'select',
      label: 'Select',
      count: null,
      active: resolved === 'select',
    };
    const brushes: ToolRow[] = (['premium', 'standard', 'walkin', 'gap'] as const).map((key) => ({
      key,
      label: TOOL_LABEL[key],
      count: counts[key],
      active: resolved === key,
    }));
    return [select, ...brushes];
  });

  private readonly counts = computed(() => {
    const c: Record<CellState, number> = { premium: 0, standard: 0, walkin: 0, gap: 0 };
    for (const row of this.grid()) {
      for (const cell of row) {
        c[cell]++;
      }
    }
    return c;
  });

  constructor() {
    // Re-runs on an in-place venue switch: reset the draft + flags, then load the new venue.
    effect(() => {
      const id = this.venueId();
      if (id !== undefined) {
        untracked(() => this.resetForVenue(id));
      }
    });

    // Scroll the armed chip into view on load/switch — the mobile rail scrolls, not wraps (#715).
    effect(() => {
      const index = TOOL_ORDER.indexOf(this.resolvedTool());
      const chips = this.toolChips();
      // Optional-called: jsdom doesn't implement it, and it's not worth failing a test over.
      chips[index]?.nativeElement.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
    });
  }

  /** Drop every venue-scoped draft/flag so nothing from the previous venue leaks, then load. */
  private resetForVenue(venueId: number): void {
    this.epoch++;
    this.grid.set([]);
    this.rowNames.set([]);
    this.storedRowNames.set([]);
    this.loadedSets.set([]);
    this.armedTool.set(null);
    this.priceByCoord.clear();
    this.activeBrush.set('premium');
    this.saving.set(false);
    this.savedNotice.set(false);
    this.errorCode.set(undefined);
    this.confirmRegen.set(false);
    this.loadedSetVersion.set(null);
    this.reloading.set(false);
    this.reloadFailed.set(false);
    this.loadFailed.set(false);
    this.mapLoaded.set(false);
    this.baselineGrid.set([]);
    this.baselineRowNames.set([]);
    this.lastChange.set(null);
    this.lastSavedAt.set(null);
    this.clearRenameNotices();
    this.renamingRow.set(null);
    this.loadExisting(venueId);
  }

  // ---- Tool rail ----

  /** Arm a rail row: Select switches to the set-editor surface; a brush arms painting and
   *  switches to the paint grid, remembering itself as {@link activeBrush}. */
  protected armTool(tool: EditorTool): void {
    this.armedTool.set(tool);
    if (tool !== 'select') {
      this.activeBrush.set(tool);
    }
  }

  /**
   * A per-set write landed: drop the console's shared snapshot (the other tabs would serve a set this
   * one just changed or removed), discard the bulk draft, and re-read the map — which re-seeds both
   * {@link SetEditor}'s selection/draft and the bulk grid.
   *
   * <p><strong>Clearing the bulk draft is the load-bearing part.</strong> {@link seedFrom} refuses to
   * overwrite a grid that already has content, so without this the bulk grid would stay frozen at the
   * map as it was when the tab opened. Per-set writes do not bump `set_version`, so the token stays
   * valid — and arming a brush would then offer a Save that the server accepts and that
   * silently reverts the operator's own per-set edits. An unsaved paint is a draft; a per-set write is
   * already committed, so the committed state wins.
   */
  protected onSetsChanged(): void {
    const venueId = this.venueId();
    if (venueId === undefined) {
      return;
    }
    this.grid.set([]);
    this.priceByCoord.clear();
    this.savedNotice.set(false);
    this.errorCode.set(undefined);
    this.venueMap.reset();
    this.loadExisting(venueId);
  }

  /** The batch editor's bulk PUT lost the optimistic-concurrency race — reuse the same
   *  reload-and-recover banner the bulk paint grid's own STALE_WRITE already drives (#714). */
  protected onBatchStaleWrite(): void {
    this.errorCode.set('STALE_WRITE');
  }

  // ---- Generate ----

  protected setRows(value: string): void {
    this.genRows.set(clampGrid(Number.parseInt(value, 10) || 0, 1, MAX_ROWS));
  }

  protected setCols(value: string): void {
    this.genCols.set(clampGrid(Number.parseInt(value, 10) || 0, 1, MAX_COLS));
  }

  protected onGenerate(): void {
    if (this.reading()) {
      return; // the button is inert meanwhile; never generate over a layout nobody has seen
    }
    if (this.hasLayout()) {
      this.confirmRegen.set(true); // regenerate replaces — confirm first
      return;
    }
    this.generateNow();
  }

  /**
   * Close the regenerate confirmation, replacing the grid or leaving it alone, and take focus back to
   * Generate. Both transitions destroy the button that was just activated, which strands keyboard/AT
   * focus on `<body>` unless it is moved deliberately (WCAG 2.4.3); Generate survives a regenerate,
   * so it is where focus belongs either way. Focus INTO the confirmation is {@link ConfirmPanel}'s.
   */
  protected confirmGenerate(): void {
    this.confirmRegen.set(false);
    this.generateNow();
    this.focusAfterRender('layout-generate');
  }

  protected cancelGenerate(): void {
    this.confirmRegen.set(false);
    this.focusAfterRender('layout-generate');
  }

  private generateNow(): void {
    this.armTool(this.activeBrush()); // a freshly generated grid needs the paint surface, not Select
    this.priceByCoord.clear(); // a fresh grid → tier-default prices, no carried-over set prices
    const rows = clampGrid(this.genRows(), 1, MAX_ROWS);
    const cols = clampGrid(this.genCols(), 1, MAX_COLS);
    const grid: CellState[][] = [];
    for (let y = 0; y < rows; y++) {
      const row: CellState[] = [];
      for (let x = 0; x < cols; x++) {
        row.push(y === 0 ? 'premium' : 'standard'); // row A (sea-facing) is auto front-row premium
      }
      grid.push(row);
    }
    this.grid.set(grid);
    this.rowNames.set(grid.map((_, y) => gridRowLabel(y)));
    this.storedRowNames.set([]); // a regenerated grid is unsaved: nothing to rename until it is
    this.savedNotice.set(false);
    this.errorCode.set(undefined);
    this.clearRenameNotices();
    // A regenerate replaces the whole grid, so every cell is unsaved surface against an empty baseline.
    this.baselineGrid.set([]);
    this.lastChange.set(`Generated a ${rows}×${cols} grid`);
  }

  /** The derived grid letter for row {@code y} — the row-name input's default and visual anchor. */
  protected rowCode(y: number): string {
    return gridRowLabel(y);
  }

  protected onRowNameInput(y: number, value: string): void {
    this.rowNames.update((names) => names.map((name, i) => (i === y ? value : name)));
    this.savedNotice.set(false);
    this.clearRenameNotices();
  }

  /** Drop both per-row notices. They are pinned to a grid index, so anything that re-indexes the
   *  rows — a re-seed, a reload, a venue switch — must clear them or they describe another row. */
  private clearRenameNotices(): void {
    this.renamedRow.set(null);
    this.rowNameError.set(null);
  }

  /** The stored label for grid row `y`, or undefined when the row has never been saved. */
  protected storedRowName(y: number): string | undefined {
    return this.storedRowNames()[y];
  }

  /**
   * Rename one stored row: a display-only write that keeps working when the bulk save is locked
   * (`LAYOUT_IN_USE`). The PUT names the row by its **stored** label, never the draft, so a second
   * rename of the same row still addresses it. On success the shared `set_version` token advances by
   * one, exactly as a reprice or a bulk save does.
   */
  protected async onRenameRow(y: number): Promise<void> {
    const venueId = this.venueId();
    const from = this.storedRowName(y);
    const typed = (this.rowNames()[y] ?? '').trim();
    const expectedVersion = this.loadedSetVersion();
    if (venueId === undefined || from === undefined || expectedVersion === null) {
      return; // defensive: the button renders only for a stored row, which implies a loaded token
    }
    if (typed === '') {
      // A cleared field reads as "cancel", not "rename me to my grid letter" — restore what is stored.
      this.rowNames.update((names) => names.map((name, i) => (i === y ? from : name)));
      this.clearRenameNotices();
      return;
    }
    const to = typed;
    if (to === from) {
      // The server no-ops this without spending set_version, so sending it would stale our token.
      this.rowNameError.set(null);
      this.renamedRow.set(y);
      return;
    }
    if (this.renamingRow() !== null || this.saving()) {
      return; // the shared set_version admits one writer: a rename cannot race another or the bulk save
    }
    const epoch = this.epoch;
    this.renamedRow.set(null);
    this.rowNameError.set(null);
    this.renamingRow.set(y);
    try {
      await firstValueFrom(this.console.renameRow(venueId, from, to, expectedVersion));
      if (this.epoch !== epoch) {
        return; // a venue switch superseded this rename (#180)
      }
      this.storedRowNames.update((names) => names.map((name, i) => (i === y ? to : name)));
      // A rename saves independently of the bulk save, so a later Discard mustn't revert it too.
      this.baselineRowNames.update((names) =>
        names.length > y ? names.map((name, i) => (i === y ? to : name)) : names,
      );
      this.loadedSets.update((sets) =>
        sets.map((set) => (set.gridY === y + 1 ? { ...set, rowLabel: to } : set)),
      );
      this.loadedSetVersion.set(expectedVersion + 1);
      this.renamedRow.set(y);
      this.venueMap.reset(); // this row's label just moved server-side — the shared snapshot is stale
    } catch (error) {
      if (this.epoch !== epoch) {
        return; // a venue switch superseded this rename (#180)
      }
      const code = rowNameErrorOf(error);
      if (code === 'STALE_WRITE') {
        this.errorCode.set('STALE_WRITE'); // a venue-level conflict — the reload banner owns recovery
      } else {
        this.rowNameError.set({ y, code });
      }
      if (code === 'UNAUTHORIZED') {
        this.operator.sessionLost();
      }
    } finally {
      this.renamingRow.set(null);
    }
  }

  /** The operator-facing message for a per-row rename failure. */
  protected rowNameErrorMessage(code: RowNameErrorCode): string {
    switch (code) {
      case 'ROW_NAME_TAKEN':
        return 'Another row already has that name. Give this row a name of its own.';
      case 'NO_SUCH_ROW':
        return 'This row no longer exists. Reload the tab and try again.';
      case 'NOT_VENUE_OWNER':
        return 'You do not manage this venue, so its rows can’t be renamed.';
      case 'NO_SUCH_VENUE':
        return 'This venue could not be found.';
      case 'INVALID_REQUEST':
        return 'That name is not valid. Use up to 40 characters.';
      case 'UNAUTHORIZED':
        return 'Your session has expired. Please sign in again.';
      default:
        return 'Something went wrong saving the name. Please try again.';
    }
  }

  // ---- Paint (click + drag; keyboard via the button's native click) ----

  /** The Tailwind background classes for a paint-tool swatch. */
  protected swatchClass(tool: CellState): string {
    return SWATCH_CLASS[tool];
  }

  /** Paint one cell with the active brush — the keyboard/click path (Enter/Space fire the button click). */
  protected paintCell(r: number, c: number): void {
    if (this.canvas()?.panGestureActive()) {
      return; // Space-drag pans at 100% zoom (#713); it never also paints
    }
    const tool = this.activeBrush();
    this.grid.update((g) =>
      g.map((row, ri) => (ri !== r ? row : row.map((cell, ci) => (ci !== c ? cell : tool)))),
    );
    this.savedNotice.set(false);
    this.lastChange.set(`Row ${gridRowLabel(r)} · position ${c + 1} → ${TOOL_LABEL[tool]}`);
  }

  /**
   * Fill a whole row with the active brush in one gesture (#713) — the row-rail's fill button,
   * generalizing {@link paintCell} from one cell to every cell in row `r`. Reachable only while a
   * brush is armed: arming Select switches the tab to {@link SetEditor} entirely (S2), so the fill
   * rail this drives is never even rendered while Select is armed.
   */
  protected fillRow(r: number): void {
    const tool = this.activeBrush();
    this.grid.update((g) => g.map((row, ri) => (ri !== r ? row : row.map(() => tool))));
    this.savedNotice.set(false);
    this.lastChange.set(`Row ${gridRowLabel(r)} → ${TOOL_LABEL[tool]}`);
  }

  /** {@link fillRow}'s column counterpart — the column-header's fill button. */
  protected fillColumn(c: number): void {
    const tool = this.activeBrush();
    this.grid.update((g) => g.map((row) => row.map((cell, ci) => (ci !== c ? cell : tool))));
    this.savedNotice.set(false);
    this.lastChange.set(`Column ${c + 1} → ${TOOL_LABEL[tool]}`);
  }

  /** The row-rail fill button's accessible name — tracks whichever brush is currently armed. */
  protected readonly rowFillLabel = (r: number): string =>
    `Fill row ${gridRowLabel(r)} with ${TOOL_LABEL[this.activeBrush()]}`;

  /** The column-header fill button's accessible name. */
  protected readonly colFillLabel = (c: number): string =>
    `Fill column ${c + 1} with ${TOOL_LABEL[this.activeBrush()]}`;

  protected onCellDown(r: number, c: number, event: MouseEvent): void {
    // Paint is a primary-button gesture, arming and disarming alike.
    if (event.button !== 0) {
      return;
    }
    this.painting = true;
    this.paintCell(r, c);
  }

  protected onCellEnter(r: number, c: number, event: MouseEvent): void {
    if (!this.painting) {
      return;
    }
    // An off-window release fires no document mouseup — disarm when no button is held.
    if ((event.buttons & 1) === 0) {
      this.painting = false;
      return;
    }
    this.paintCell(r, c);
  }

  /** A press starting anywhere but a cell clears a stale armed flag (bubbles after onCellDown). */
  protected onDocumentMouseDown(event: MouseEvent): void {
    const onCell =
      event.target instanceof Element &&
      event.target.closest('[data-testid="layout-cell"]') !== null;
    if (!onCell) {
      this.painting = false;
    }
  }

  /** A touch landed on a cell: paint it and arm the gesture — the touch counterpart to
   *  {@link onCellDown}. Each cell is `touch-none` (its own template class), so the browser never
   *  turns this touch into a page scroll instead. */
  protected onCellTouchStart(r: number, c: number): void {
    this.painting = true;
    this.paintCell(r, c);
  }

  /** The touch counterpart to {@link onCellEnter}: find the cell under the finger's current
   *  position and paint it, mid-gesture. Document-level so it fires wherever the finger has moved,
   *  not just while still over the cell that started the touch. */
  protected onDocumentTouchMove(event: TouchEvent): void {
    if (!this.painting) {
      return;
    }
    const touch = event.touches[0];
    if (touch === undefined) {
      return;
    }
    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = target instanceof Element ? target.closest('[data-testid="layout-cell"]') : null;
    if (!(cell instanceof HTMLElement)) {
      return;
    }
    const r = Number(cell.dataset['gridRow']);
    const c = Number(cell.dataset['gridCol']);
    if (Number.isNaN(r) || Number.isNaN(c)) {
      return;
    }
    this.paintCell(r, c);
  }

  protected onPaintEnd(): void {
    this.painting = false;
  }

  // ---- Save ----

  protected async onSave(): Promise<void> {
    const venueId = this.venueId();
    if (venueId === undefined) {
      return;
    }
    if (this.duplicateRowName() !== undefined) {
      return; // the row-names panel is already showing the clash; the server would refuse it anyway
    }
    const sets = this.toRequest();
    if (sets.length === 0) {
      this.errorCode.set('EMPTY_LAYOUT');
      return;
    }
    const expectedVersion = this.loadedSetVersion();
    if (expectedVersion === null) {
      // The initial map read failed, so we never got the concurrency token; a save would be unsafe. Don't
      // silently no-op (review finding) — surface it and prompt a refresh, which re-loads the token.
      this.loadFailed.set(true);
      return;
    }
    if (this.renamingRow() !== null) {
      return; // the other half of the shared-token guard: a rename in flight owns the version
    }
    const epoch = this.epoch;
    this.saving.set(true);
    this.errorCode.set(undefined);
    this.savedNotice.set(false);
    try {
      await firstValueFrom(this.console.replaceLayout(venueId, { sets, expectedVersion }));
      if (this.epoch !== epoch) {
        return; // a venue switch superseded this save (#180); saving clears in finally
      }
      this.savedNotice.set(true);
      // Only rows that contributed a set exist server-side; an all-gap row has nothing to rename.
      const written = new Set(sets.map((set) => set.gridY - 1));
      const saved = this.effectiveRowNames();
      this.storedRowNames.set(saved.map((label, y) => (written.has(y) ? label : undefined)));
      // The layout was replaced, so the console's shared snapshot now describes retired sets.
      this.venueMap.reset();
      // The conditional write bumped set_version by one; advance the token so a second save isn't stale.
      this.loadedSetVersion.set(expectedVersion + 1);
      // The grid just saved becomes the new baseline: nothing pending until the next paint/generate.
      this.baselineGrid.set(cloneGrid(this.grid()));
      this.baselineRowNames.set(this.effectiveRowNames());
      this.lastChange.set(null);
      this.lastSavedAt.set(new Date());
    } catch (error) {
      if (this.epoch !== epoch) {
        return; // a venue switch superseded this save (#180)
      }
      const code = layoutErrorOf(error);
      this.errorCode.set(code);
      if (code === 'UNAUTHORIZED') {
        this.operator.sessionLost();
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** The operator-facing message for the current error code, or undefined. */
  protected errorMessage(): string | undefined {
    switch (this.errorCode()) {
      case undefined:
        return undefined;
      case 'LAYOUT_IN_USE':
        return 'This venue has been booked at least once, or some of its sets are still held, so replacing the whole layout is locked. Arm Select on the tool rail to add and change sets one at a time — though any set that is held or has ever been booked can’t be removed there either.';
      case 'EMPTY_LAYOUT':
        return 'Add at least one set before saving.';
      case 'LAYOUT_TOO_LARGE':
        return 'The layout is too large. Reduce the number of rows or positions.';
      case 'CELL_TAKEN':
      case 'DUPLICATE_POSITION':
      case 'CONFLICT':
        return 'Two sets overlap on the grid. Please adjust and try again.';
      case 'NO_SUCH_VENUE':
        return 'This venue could not be found.';
      case 'STALE_WRITE':
        // Rendered by the dedicated recover-and-reload banner in the template, not this inline message.
        return undefined;
      case 'UNAUTHORIZED':
        return 'Your session has expired. Please sign in again.';
      default:
        return 'Something went wrong saving the layout. Please try again.';
    }
  }

  /**
   * Recover from a `409 STALE_WRITE`: re-fetch the latest server layout and — ONLY on a successful
   * reload — discard the in-progress grid for it, re-seeding every cell, its prices, and the `setVersion`
   * token, and clear the conflict banner. If the reload GET fails, the painted grid, the stale token, and
   * the banner are all KEPT and a retry hint is shown — the operator never loses work to a failed reload
   * (review finding). The 409 itself never touched the grid, so until a successful Reload the operator's
   * work is intact.
   */
  protected reloadAfterStale(): void {
    const venueId = this.venueId();
    if (venueId === undefined || this.reloading()) {
      return;
    }
    const epoch = this.epoch;
    this.reloading.set(true);
    this.reloadFailed.set(false);
    this.venueMap.reset(); // the other tabs must not serve the pre-conflict layout either (#486)
    this.venues.getVenueMap(venueId, todayBookingDate(new Date())).subscribe({
      next: (venue) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this reload (#180)
        }
        // Success: NOW replace the in-progress grid with the server's latest layout + token, clear the banner.
        this.priceByCoord.clear();
        this.grid.set([]); // hasLayout() → false, so seedFrom re-seeds (or leaves the empty state)
        this.baselineGrid.set([]);
        this.baselineRowNames.set([]);
        this.lastChange.set(null);
        this.loadedSetVersion.set(venue.setVersion ?? null);
        this.loadFailed.set(false);
        this.mapLoaded.set(true);
        this.loadedSets.set(venue.sets);
        this.seedFrom(venue.sets);
        this.errorCode.set(undefined);
        this.savedNotice.set(false);
        this.reloading.set(false);
      },
      error: (error: unknown) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this reload (#180)
        }
        // Failure: keep the painted grid, the stale token, and the banner; show a retry hint — no data loss.
        this.reloadFailed.set(true);
        this.reloading.set(false);
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.operator.sessionLost();
        }
      },
    });
  }

  private toRequest(): LayoutCellRequest[] {
    const sets: LayoutCellRequest[] = [];
    const rowLabels = this.effectiveRowNames();
    this.grid().forEach((row, y) => {
      row.forEach((state, x) => {
        if (state === 'gap') {
          return;
        }
        const premium = state === 'premium';
        sets.push({
          rowLabel: rowLabels[y],
          positionNo: x + 1,
          tier: premium ? 'PREMIUM' : 'STANDARD',
          pool: state === 'walkin' ? 'WALK_IN' : 'ONLINE',
          // Preserve a loaded set's price; only a new cell takes the tier default (Pricing owns prices).
          price:
            this.priceByCoord.get(coordKey(x + 1, y + 1)) ??
            (premium ? PREMIUM_PRICE : STANDARD_PRICE),
          gridX: x + 1,
          gridY: y + 1,
        });
      });
    });
    return sets;
  }

  /**
   * Best-effort: seed the grid from the venue's current layout so the operator paints on it. An empty
   * venue leaves the empty state, from which Generate builds a fresh grid. Always capture the
   * optimistic-concurrency token (`setVersion`) so a later Save can echo it back; a failed read leaves
   * the token null and sets loadFailed so Save surfaces a refresh prompt (never a silent no-op).
   */
  private loadExisting(venueId: number): void {
    const epoch = this.epoch;
    this.reading.set(true);
    this.venues.getVenueMap(venueId, todayBookingDate(new Date())).subscribe({
      next: (venue) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this load — never seed the new venue's editor (#180)
        }
        this.reading.set(false);
        this.loadFailed.set(false);
        this.mapLoaded.set(true);
        this.loadedSetVersion.set(venue.setVersion ?? null);
        this.loadedSets.set(venue.sets);
        this.seedFrom(venue.sets);
      },
      error: (error: unknown) => {
        if (this.epoch !== epoch) {
          return; // a venue switch superseded this load (#180)
        }
        this.reading.set(false);
        this.loadFailed.set(true);
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.operator.sessionLost();
        }
      },
    });
  }

  private seedFrom(sets: readonly SetView[]): void {
    this.clearRenameNotices(); // above the early return: an emptied venue re-indexes the rows too
    if (sets.length === 0 || this.hasLayout()) {
      // Empty venue, or the async read resolved after the operator already generated/painted — don't
      // clobber their in-progress work with the loaded layout.
      return;
    }
    const maxY = Math.max(...sets.map((s) => s.gridY));
    const maxX = Math.max(...sets.map((s) => s.gridX));
    const grid: CellState[][] = Array.from({ length: maxY }, () =>
      Array.from<CellState>({ length: maxX }).fill('gap'),
    );
    for (const s of sets) {
      grid[s.gridY - 1][s.gridX - 1] = cellStateOf(s);
      this.priceByCoord.set(coordKey(s.gridX, s.gridY), s.price); // preserve prices for a lossless save
    }
    this.grid.set(grid);
    this.baselineGrid.set(cloneGrid(grid)); // a freshly-loaded grid is, by definition, all saved
    // One pass for both arrays: two independent scans could drift, and the layout can be 1040 sets.
    const storedByRow = new Map<number, string>();
    for (const s of sets) {
      storedByRow.set(s.gridY - 1, s.rowLabel);
    }
    // Preserve each row's loaded label for a lossless save (#723); an all-gap row takes its letter.
    const names = grid.map((_, y) => storedByRow.get(y) ?? gridRowLabel(y));
    this.rowNames.set(names);
    this.baselineRowNames.set(names);
    this.storedRowNames.set(grid.map((_, y) => storedByRow.get(y)));
    this.genRows.set(clampGrid(maxY, 1, MAX_ROWS));
    this.genCols.set(clampGrid(maxX, 1, MAX_COLS));
  }

  /** Discard the unsaved draft, restoring the grid and row names to {@link baselineGrid} /
   *  {@link baselineRowNames} — a no-op while nothing is dirty or a save is already in flight. */
  protected discard(): void {
    if (!this.isDirty() || this.saving()) {
      return;
    }
    this.grid.set(cloneGrid(this.baselineGrid()));
    this.rowNames.set([...this.baselineRowNames()]);
    this.lastChange.set(null);
    this.savedNotice.set(false);
    this.errorCode.set(undefined);
    this.clearRenameNotices();
  }

  /** The per-row price string: the price the row's first set would save with (preserved or tier default). */
  private rowPriceStr(row: readonly CellState[], y: number): string {
    const firstSet = row.findIndex((s) => s !== 'gap');
    if (firstSet === -1) {
      return '';
    }
    const premium = row[firstSet] === 'premium';
    const price =
      this.priceByCoord.get(coordKey(firstSet + 1, y + 1)) ??
      (premium ? PREMIUM_PRICE : STANDARD_PRICE);
    return formatMoney(price);
  }
}

function coordKey(gridX: number, gridY: number): string {
  return `${gridX},${gridY}`;
}

/** A deep copy, so mutating the clone (or the source, via `grid.update`) never aliases the other. */
function cloneGrid(grid: readonly CellState[][]): CellState[][] {
  return grid.map((row) => [...row]);
}

/** The save bar's last-saved clock time, in Europe/Tirane — a display convenience, not a booking date. */
function formatClockTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Tirane',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
