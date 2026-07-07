import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { formatMoney } from '../shared/money';
import { todayBookingDate } from '../venue/booking-date';
import { MoneyView, SetView } from '../venue/venue.model';
import { VenueService } from '../venue/venue.service';
import { LayoutCellRequest, LayoutErrorCode } from './operator-console.model';
import { OperatorConsoleService, layoutErrorOf } from './operator-console.service';

/** What a grid cell holds. `gap` = no set (an aisle); the three others are paint tools too. */
type CellState = 'premium' | 'standard' | 'walkin' | 'gap';

/** A paint tool, in design order. `gap` erases a cell back to an aisle. */
type PaintTool = CellState;

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

const TOOL_LABEL: Record<PaintTool, string> = {
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
const SWATCH_CLASS: Record<PaintTool, string> = {
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
  imports: [CardGlass],
  templateUrl: './layout-editor.html',
})
export class LayoutEditor {
  private readonly route = inject(ActivatedRoute);
  private readonly venues = inject(VenueService);
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
  protected readonly activeTool = signal<PaintTool>('premium');

  /** True while the save PUT is in flight (button disabled, no double submit). */
  protected readonly saving = signal(false);
  /** Set after a successful save; cleared on the next edit. */
  protected readonly savedNotice = signal(false);
  /** The last write failure, mapped to operator-facing copy, or undefined. */
  protected readonly errorCode = signal<LayoutErrorCode | undefined>(undefined);
  /** True while awaiting confirmation of a destructive regenerate over an existing grid. */
  protected readonly confirmRegen = signal(false);

  /** Whether a grid exists (drives the empty-state vs the grid + save button). */
  protected readonly hasLayout = computed(() => this.grid().length > 0);
  /** The column count of the current grid (0 when empty) — drives the CSS grid template. */
  protected readonly colCount = computed(() => this.grid()[0]?.length ?? 0);
  protected readonly genTotal = computed(
    () => clamp(this.genRows(), 1, MAX_ROWS) * clamp(this.genCols(), 1, MAX_COLS),
  );

  /** Drag state — a plain field (not reactive; only the pointer handlers read it). */
  private painting = false;

  /** The display rows: label, per-row price string, and each cell's state + AT label. */
  protected readonly displayRows = computed(() =>
    this.grid().map((row, y) => ({
      label: rowLabel(y),
      priceStr: rowPriceStr(row),
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
    const id = Number(this.route.parent?.snapshot.paramMap.get('venueId'));
    if (Number.isInteger(id) && id > 0) {
      this.venueId = id;
      this.loadExisting(id);
    }
  }

  // ---- Generate ----

  protected setRows(value: string): void {
    this.genRows.set(clamp(parseInt(value, 10) || 0, 1, MAX_ROWS));
  }

  protected setCols(value: string): void {
    this.genCols.set(clamp(parseInt(value, 10) || 0, 1, MAX_COLS));
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

  protected selectTool(tool: PaintTool): void {
    this.activeTool.set(tool);
  }

  /** The Tailwind background classes for a grid cell of the given state (test-hook: also `data-state`). */
  protected cellClass(state: CellState): string {
    return CELL_CLASS[state];
  }

  /** The Tailwind background classes for a paint-tool swatch. */
  protected swatchClass(tool: PaintTool): string {
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
    this.saving.set(true);
    this.errorCode.set(undefined);
    this.savedNotice.set(false);
    try {
      await firstValueFrom(this.console.replaceLayout(this.venueId, { sets }));
      this.savedNotice.set(true);
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
      case 'UNAUTHORIZED':
        return 'Your session has expired. Please sign in again.';
      default:
        return 'Something went wrong saving the layout. Please try again.';
    }
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
          price: premium ? PREMIUM_PRICE : STANDARD_PRICE,
          gridX: x + 1,
          gridY: y + 1,
        });
      });
    });
    return sets;
  }

  private loadExisting(venueId: number): void {
    // Best-effort: seed the grid from the venue's current layout so the operator paints on it. A failed
    // read (or an empty venue) leaves the empty state, from which Generate builds a fresh grid.
    this.venues.getVenueMap(venueId, todayBookingDate(new Date())).subscribe({
      next: (venue) => this.seedFrom(venue.sets),
      error: () => {
        // best-effort — start from the empty state
      },
    });
  }

  private seedFrom(sets: readonly SetView[]): void {
    if (sets.length === 0) {
      return; // empty venue — leave the empty state so the operator generates
    }
    const maxY = Math.max(...sets.map((s) => s.gridY));
    const maxX = Math.max(...sets.map((s) => s.gridX));
    const grid: CellState[][] = Array.from({ length: maxY }, () =>
      Array.from<CellState>({ length: maxX }).fill('gap'),
    );
    for (const s of sets) {
      grid[s.gridY - 1][s.gridX - 1] = cellStateOf(s);
    }
    this.grid.set(grid);
    this.genRows.set(clamp(maxY, 1, MAX_ROWS));
    this.genCols.set(clamp(maxX, 1, MAX_COLS));
  }
}

function cellStateOf(set: SetView): CellState {
  if (set.pool === 'WALK_IN') {
    return 'walkin';
  }
  return set.tier === 'PREMIUM' ? 'premium' : 'standard';
}

function rowLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

function rowPriceStr(row: readonly CellState[]): string {
  if (row.some((s) => s === 'premium')) {
    return formatMoney(PREMIUM_PRICE);
  }
  if (row.some((s) => s !== 'gap')) {
    return formatMoney(STANDARD_PRICE);
  }
  return '';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
