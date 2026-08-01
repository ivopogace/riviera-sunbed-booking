import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { formatMoney, MoneyView } from '../shared/money';
import { parentVenueId } from '../shared/parent-venue-id';
import { BeachGridFrame } from './beach-grid-frame';
import { todayBookingDate } from '../shared/booking-date';
import { SetView } from '../shared/venue-views';
import { VenueService } from '../venue/venue.service';
import { ConsoleVenueMap } from './console-venue-map';
import { LayoutCellRequest, LayoutErrorCode } from './operator-console.model';
import { OperatorConsoleService, layoutErrorOf } from './operator-console.service';

/** What a grid cell holds, and the paint tools (in design order). `gap` = no set / erase to an aisle. */
type CellState = 'premium' | 'standard' | 'walkin' | 'gap';

const PREMIUM_PRICE: MoneyView = { minorUnits: 3500, currency: 'EUR' };
const STANDARD_PRICE: MoneyView = { minorUnits: 2000, currency: 'EUR' };
const MAX_ROWS = 26;
const MAX_COLS = 40;

/** Human, AT-readable description of a cell's current state (paired with its row/position). */
const STATE_DESC: Record<CellState, string> = {
  premium: 'front row, premium, online',
  standard: 'standard, online',
  walkin: 'walk-in pool, not bookable online',
  gap: 'gap or aisle',
};

const TOOL_LABEL: Record<CellState, string> = {
  premium: 'Front row · premium',
  standard: 'Standard set',
  walkin: 'Walk-in pool',
  gap: 'Gap / aisle',
};

/** Per-state grid-cell background classes (border-radius stays on the cell element — no drift). */
const CELL_CLASS: Record<CellState, string> = {
  premium: 'border-[#b47814]/40 bg-[linear-gradient(180deg,#ffe3a3,#f4c05a)]',
  standard: 'border-[#0c2a33]/15 bg-white/85',
  walkin:
    'border-[#0c2a33]/15 bg-[repeating-linear-gradient(45deg,rgba(12,42,51,0.3)_0_3px,rgba(12,42,51,0.12)_3px_6px)]',
  gap: 'border-dashed border-[#0c2a33]/35 bg-transparent',
};

/** Per-tool swatch background classes (mirrors {@link CELL_CLASS}, sized by the swatch element). */
const SWATCH_CLASS: Record<CellState, string> = {
  premium: 'bg-[linear-gradient(180deg,#ffe3a3,#f4c05a)]',
  standard: 'bg-white/85',
  walkin: 'bg-[repeating-linear-gradient(45deg,rgba(12,42,51,0.35)_0_3px,rgba(12,42,51,0.12)_3px_6px)]',
  gap: 'bg-transparent',
};

/**
 * The O3 Layout-editor tab (issue #172) — the beach-map generate-grid + paint editor that replaces the
 * console's beach-map placeholder. The operator generates an R×C grid in one action (row A faces the
 * sea, auto-priced front-row premium), paints tier/pool/gap per cell by click or drag, and saves the
 * whole grid through one owner-asserted bulk write (`PUT …/beach-map`). Regenerate replaces after an
 * explicit confirm; a venue with bookings or walk-in holds is server-locked (`LAYOUT_IN_USE`).
 *
 * <p>Reads `:venueId` from the parent route (child routes don't inherit it — O1 finding). Cells are
 * real, individually-labelled `<button>`s so the grid is fully keyboard + AT operable (Enter/Space
 * paints with the active tool); drag-paint is the mouse affordance on top. Always porcelain (inherited
 * from the console shell); glass via {@link CardGlass}; money via {@link formatMoney} (invariant #5 —
 * the default prices are integer minor-unit EUR constants, editable later in the O4 Pricing tab).
 */
@Component({
  selector: 'app-layout-editor',
  imports: [CardGlass, BeachGridFrame],
  templateUrl: './layout-editor.html',
})
export class LayoutEditor {
  private readonly route = inject(ActivatedRoute);
  private readonly venues = inject(VenueService);
  private readonly venueMap = inject(ConsoleVenueMap);
  private readonly console = inject(OperatorConsoleService);
  protected readonly operator = inject(OperatorAuth);

  /** The venue this editor manages, from the parent `/operator/:venueId` route (undefined if invalid). */
  protected readonly venueId: number | undefined;

  /** Generate inputs: rows × positions. Clamped to the design maxima on generate. */
  protected readonly genRows = signal(4);
  protected readonly genCols = signal(6);

  /** The current grid, row-major with row 0 sea-facing. Empty until generated or loaded. */
  protected readonly grid = signal<CellState[][]>([]);
  /** The active paint tool. */
  protected readonly activeTool = signal<CellState>('premium');

  /** True while the save PUT is in flight (button disabled, no double submit). */
  protected readonly saving = signal(false);
  /** Set after a successful save; cleared on the next edit. */
  protected readonly savedNotice = signal(false);
  /** The last write failure, mapped to operator-facing copy, or undefined. */
  protected readonly errorCode = signal<LayoutErrorCode | undefined>(undefined);
  /** True while awaiting confirmation of a destructive regenerate over an existing grid. */
  protected readonly confirmRegen = signal(false);
  /** The optimistic-concurrency token loaded with the map (#226 `setVersion`), echoed back on Save; a
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

  /** Whether a grid exists (drives the empty-state vs the grid + save button). */
  protected readonly hasLayout = computed(() => this.grid().length > 0);
  /** The column count of the current grid (0 when empty) — drives the CSS grid template. */
  protected readonly colCount = computed(() => this.grid()[0]?.length ?? 0);
  protected readonly genTotal = computed(
    () => clamp(this.genRows(), 1, MAX_ROWS) * clamp(this.genCols(), 1, MAX_COLS),
  );

  /** Drag state — a plain field (not reactive; only the pointer handlers read it). */
  private painting = false;

  /**
   * Prices of the sets loaded from the venue, keyed by `${gridX},${gridY}` — so a load→save round-trip
   * preserves each set's existing price instead of resetting it to the tier default (O4 owns price
   * editing). Newly generated cells have no entry and fall back to the tier default. Mutated only
   * alongside a `grid.set(...)`, so the `displayRows` computed reads it consistently.
   */
  private readonly priceByCoord = new Map<string, MoneyView>();

  /** The display rows: label, per-row price string, and each cell's state + AT label. */
  protected readonly displayRows = computed(() =>
    this.grid().map((row, y) => ({
      label: rowLabel(y),
      priceStr: this.rowPriceStr(row, y),
      cells: row.map((state, x) => ({
        state,
        label: `Row ${rowLabel(y)} position ${x + 1}, ${STATE_DESC[state]}`,
      })),
    })),
  );

  /** The four paint tools with live cell counts (design order). */
  protected readonly tools = computed(() => {
    const counts = this.counts();
    return (['premium', 'standard', 'walkin', 'gap'] as const).map((key) => ({
      key,
      label: TOOL_LABEL[key],
      count: counts[key],
      active: this.activeTool() === key,
    }));
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
    const id = parentVenueId(this.route);
    if (id !== undefined) {
      this.venueId = id;
      this.loadExisting(id);
    }
  }

  // ---- Generate ----

  protected setRows(value: string): void {
    this.genRows.set(clamp(Number.parseInt(value, 10) || 0, 1, MAX_ROWS));
  }

  protected setCols(value: string): void {
    this.genCols.set(clamp(Number.parseInt(value, 10) || 0, 1, MAX_COLS));
  }

  protected onGenerate(): void {
    if (this.hasLayout()) {
      this.confirmRegen.set(true); // regenerate replaces — confirm first
      return;
    }
    this.generateNow();
  }

  protected confirmGenerate(): void {
    this.confirmRegen.set(false);
    this.generateNow();
  }

  protected cancelGenerate(): void {
    this.confirmRegen.set(false);
  }

  private generateNow(): void {
    this.priceByCoord.clear(); // a fresh grid → tier-default prices, no carried-over set prices
    const rows = clamp(this.genRows(), 1, MAX_ROWS);
    const cols = clamp(this.genCols(), 1, MAX_COLS);
    const grid: CellState[][] = [];
    for (let y = 0; y < rows; y++) {
      const row: CellState[] = [];
      for (let x = 0; x < cols; x++) {
        row.push(y === 0 ? 'premium' : 'standard'); // row A (sea-facing) is auto front-row premium
      }
      grid.push(row);
    }
    this.grid.set(grid);
    this.savedNotice.set(false);
    this.errorCode.set(undefined);
  }

  // ---- Paint (click + drag; keyboard via the button's native click) ----

  protected selectTool(tool: CellState): void {
    this.activeTool.set(tool);
  }

  /** The Tailwind background classes for a grid cell of the given state (test-hook: also `data-state`). */
  protected cellClass(state: CellState): string {
    return CELL_CLASS[state];
  }

  /** The Tailwind background classes for a paint-tool swatch. */
  protected swatchClass(tool: CellState): string {
    return SWATCH_CLASS[tool];
  }

  /** Paint one cell with the active tool — the keyboard/click path (Enter/Space fire the button click). */
  protected paintCell(r: number, c: number): void {
    const tool = this.activeTool();
    this.grid.update((g) =>
      g.map((row, ri) => (ri !== r ? row : row.map((cell, ci) => (ci !== c ? cell : tool)))),
    );
    this.savedNotice.set(false);
  }

  protected onCellDown(r: number, c: number): void {
    this.painting = true;
    this.paintCell(r, c);
  }

  protected onCellEnter(r: number, c: number): void {
    if (this.painting) {
      this.paintCell(r, c);
    }
  }

  protected onPaintEnd(): void {
    this.painting = false;
  }

  // ---- Save ----

  protected async onSave(): Promise<void> {
    if (this.venueId === undefined) {
      return;
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
    this.saving.set(true);
    this.errorCode.set(undefined);
    this.savedNotice.set(false);
    try {
      await firstValueFrom(this.console.replaceLayout(this.venueId, { sets, expectedVersion }));
      this.savedNotice.set(true);
      // The layout was replaced, so the console's shared snapshot now describes retired sets (#486).
      this.venueMap.reset();
      // The conditional write bumped set_version by exactly one (#226); advance our token so a second
      // consecutive save by the same operator isn't spuriously rejected as a stale write.
      this.loadedSetVersion.set(expectedVersion + 1);
    } catch (error) {
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
        return 'This venue has bookings or walk-in holds, so its layout is locked. Layout changes are not possible while sets are in use.';
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
   * Recover from a `409 STALE_WRITE` (#226): re-fetch the latest server layout and — ONLY on a successful
   * reload — discard the in-progress grid for it, re-seeding every cell, its prices, and the `setVersion`
   * token, and clear the conflict banner. If the reload GET fails, the painted grid, the stale token, and
   * the banner are all KEPT and a retry hint is shown — the operator never loses work to a failed reload
   * (review finding). The 409 itself never touched the grid, so until a successful Reload the operator's
   * work is intact.
   */
  protected reloadAfterStale(): void {
    const venueId = this.venueId;
    if (venueId === undefined || this.reloading()) {
      return;
    }
    this.reloading.set(true);
    this.reloadFailed.set(false);
    this.venueMap.reset(); // the other tabs must not serve the pre-conflict layout either (#486)
    this.venues.getVenueMap(venueId, todayBookingDate(new Date())).subscribe({
      next: (venue) => {
        // Success: NOW replace the in-progress grid with the server's latest layout + token, clear the banner.
        this.priceByCoord.clear();
        this.grid.set([]); // hasLayout() → false, so seedFrom re-seeds (or leaves the empty state)
        this.loadedSetVersion.set(venue.setVersion ?? null);
        this.loadFailed.set(false);
        this.seedFrom(venue.sets);
        this.errorCode.set(undefined);
        this.savedNotice.set(false);
        this.reloading.set(false);
      },
      error: (error: unknown) => {
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
    this.grid().forEach((row, y) => {
      row.forEach((state, x) => {
        if (state === 'gap') {
          return;
        }
        const premium = state === 'premium';
        sets.push({
          rowLabel: rowLabel(y),
          positionNo: x + 1,
          tier: premium ? 'PREMIUM' : 'STANDARD',
          pool: state === 'walkin' ? 'WALK_IN' : 'ONLINE',
          // Preserve a loaded set's existing price; only a newly generated/painted cell takes the
          // tier default (O4 owns price editing — a load→save round-trip must not reset prices).
          price: this.priceByCoord.get(coordKey(x + 1, y + 1)) ?? (premium ? PREMIUM_PRICE : STANDARD_PRICE),
          gridX: x + 1,
          gridY: y + 1,
        });
      });
    });
    return sets;
  }

  private loadExisting(venueId: number): void {
    // Best-effort: seed the grid from the venue's current layout so the operator paints on it. An empty
    // venue leaves the empty state, from which Generate builds a fresh grid. Always capture the
    // optimistic-concurrency token (#226 setVersion) so a later Save can echo it back; a failed read leaves
    // the token null and sets loadFailed so Save surfaces a refresh prompt (never a silent no-op).
    this.venues.getVenueMap(venueId, todayBookingDate(new Date())).subscribe({
      next: (venue) => {
        this.loadFailed.set(false);
        this.loadedSetVersion.set(venue.setVersion ?? null);
        this.seedFrom(venue.sets);
      },
      error: (error: unknown) => {
        this.loadFailed.set(true);
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.operator.sessionLost();
        }
      },
    });
  }

  private seedFrom(sets: readonly SetView[]): void {
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
    this.genRows.set(clamp(maxY, 1, MAX_ROWS));
    this.genCols.set(clamp(maxX, 1, MAX_COLS));
  }

  /** The per-row price string: the price the row's first set would save with (preserved or tier default). */
  private rowPriceStr(row: readonly CellState[], y: number): string {
    const firstSet = row.findIndex((s) => s !== 'gap');
    if (firstSet === -1) {
      return '';
    }
    const premium = row[firstSet] === 'premium';
    const price =
      this.priceByCoord.get(coordKey(firstSet + 1, y + 1)) ?? (premium ? PREMIUM_PRICE : STANDARD_PRICE);
    return formatMoney(price);
  }
}

function cellStateOf(set: SetView): CellState {
  if (set.pool === 'WALK_IN') {
    return 'walkin';
  }
  return set.tier === 'PREMIUM' ? 'premium' : 'standard';
}

function rowLabel(index: number): string {
  return String.fromCodePoint(65 + index);
}

function coordKey(gridX: number, gridY: number): string {
  return `${gridX},${gridY}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
