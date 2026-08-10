import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { disabled, form, FormField } from '@angular/forms/signals';
import { firstValueFrom, Observable } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { CardGlass } from '../shared/card-glass';
import { eurosToMinorUnits, minorUnitsToEuros } from '../shared/money';
import { Pool, SetView, Tier } from '../shared/venue-views';
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
import { BeachGridFrame } from './beach-grid-frame';
import { SetWriteErrorCode, SetWriteRequest } from './operator-console.model';
import { OperatorConsoleService, setWriteErrorOf } from './operator-console.service';

/** What the panel is editing: one saved set, one empty cell to add into, or nothing. */
type Selection =
  | { readonly kind: 'set'; readonly setId: number }
  | { readonly kind: 'cell'; readonly gridX: number; readonly gridY: number }
  | null;

/** The editable copy of a set, seeded from the server and overwritten by the operator. */
interface SetDraft {
  readonly tier: Tier;
  readonly pool: Pool;
  readonly priceEur: string;
  readonly currency: string;
}

const EMPTY_DRAFT: SetDraft = { tier: 'STANDARD', pool: 'ONLINE', priceEur: '', currency: 'EUR' };

/** A new set's defaults, following the bulk generator's rule: row A faces the sea and is front-row. */
function draftForNewCell(gridY: number): SetDraft {
  const premium = gridY === 1;
  return {
    tier: premium ? 'PREMIUM' : 'STANDARD',
    pool: 'ONLINE',
    priceEur: minorUnitsToEuros(premium ? 3500 : 2000),
    currency: 'EUR',
  };
}

/**
 * The per-set beach-map editor — the console's answer to a venue that has started trading. The bulk
 * `PUT …/beach-map` beside it is reject-unless-unclaimed, so once a venue takes its first booking its
 * map is frozen; these three U7 endpoints are not, and this surface is how an operator reaches them.
 *
 * <p>It renders the <strong>server's</strong> sets by id rather than a painted grid, because the
 * endpoints address a set by `setId` and a painted cell has no identity. Clicking a cell selects it;
 * the panel edits tier, pool and price and saves one `PATCH` carrying the whole set body (a partial
 * body is rejected `400`).
 *
 * <p><strong>Nothing is applied optimistically.</strong> The server's claim guard refuses a repool or
 * reposition of a set someone is still owed, and no read predicts it, so a refusal must leave the map
 * exactly as the server still has it: the grid re-renders only from the parent's re-read, which
 * {@link changed} asks for. Selection and draft are `linkedSignal`s over {@link sets}, so that
 * re-read re-seeds them instead of stranding an edit whose basis has moved.
 *
 * <p>Rationale for the reactive-only guard discovery, the no-`expectedVersion` writes and the
 * venue-switch guard: `docs/plans/per-set-beach-map-editing.md`.
 */
@Component({
  selector: 'app-set-editor',
  imports: [CardGlass, BeachGridFrame, BeachCell, FormField],
  templateUrl: './set-editor.html',
})
export class SetEditor {
  private readonly console = inject(OperatorConsoleService);
  private readonly hostRef: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly operator = inject(OperatorAuth);

  /** The venue whose map is being edited — owner-asserted server-side on every write (invariant #13). */
  readonly venueId = input.required<number>();
  /** The venue's saved sets, from the parent's map read. Replacing this re-seeds selection and draft. */
  readonly sets = input.required<readonly SetView[]>();
  /** A write landed: the parent drops the shared console snapshot and re-reads the map. */
  readonly changed = output<void>();

  /** True while a per-set write is in flight — the panel's actions are disabled, so no double submit. */
  protected readonly busy = signal(false);
  /** Set after a successful write, cleared when the next one starts or the selection moves. */
  protected readonly saved = signal(false);
  /** The last write failure, mapped to operator-facing copy, or undefined. */
  protected readonly errorCode = signal<SetWriteErrorCode | undefined>(undefined);
  /** True while awaiting confirmation of a remove — a destructive action is never one tap away. */
  protected readonly confirmRemove = signal(false);
  /** Whether a Move has been armed. Read {@link armed}, never this — an arm outlives its own subject. */
  private readonly moving = signal(false);

  /**
   * Rows and positions added on top of the sets' own bounding box, so a set can be placed where none
   * has ever been. Reset by every re-read: once the added cell holds a set, the real extent covers it,
   * and keeping the offset would grow the grid twice.
   */
  private readonly extraRows = linkedSignal<readonly SetView[], number>({
    source: this.sets,
    computation: () => 0,
  });
  private readonly extraCols = linkedSignal<readonly SetView[], number>({
    source: this.sets,
    computation: () => 0,
  });

  /**
   * The selected set, kept across a re-read while it still exists and dropped when it does not — the
   * documented `linkedSignal` "account for previous state" shape, which is also why this is not an
   * `effect` syncing one signal into another.
   */
  protected readonly selection = linkedSignal<readonly SetView[], Selection>({
    source: this.sets,
    computation: (sets, previous) => {
      const chosen = previous?.value;
      if (chosen === null || chosen === undefined) {
        return null;
      }
      if (chosen.kind === 'set') {
        return sets.some((s) => s.id === chosen.setId) ? chosen : null;
      }
      const occupied = sets.some((s) => s.gridX === chosen.gridX && s.gridY === chosen.gridY);
      return occupied ? null : chosen;
    },
  });

  /** The selected set's server state, or undefined when nothing or an empty cell is selected. */
  protected readonly selectedSet = computed(() => {
    const chosen = this.selection();
    return chosen?.kind === 'set' ? this.sets().find((s) => s.id === chosen.setId) : undefined;
  });

  /** The empty cell being added into, or undefined. */
  protected readonly selectedCell = computed(() => {
    const chosen = this.selection();
    return chosen?.kind === 'cell' ? chosen : undefined;
  });

  /** The editable draft, re-seeded whenever the selection moves OR the server's copy is re-read. */
  protected readonly draft = linkedSignal<SetDraft>(() => {
    const cell = this.selectedCell();
    if (cell !== undefined) {
      return draftForNewCell(cell.gridY);
    }
    const selected = this.selectedSet();
    return selected === undefined
      ? EMPTY_DRAFT
      : {
          tier: selected.tier,
          pool: selected.pool,
          priceEur: minorUnitsToEuros(selected.price.minorUnits),
          currency: selected.price.currency,
        };
  });

  /**
   * Whether the draft has diverged from the set as saved. A move deliberately sends the SAVED values
   * (it is a reposition, not a bundled edit), so offering it over a dirty draft would silently drop
   * the operator's change — Move is disabled instead, and says why.
   */
  protected readonly dirty = computed(() => {
    const selected = this.selectedSet();
    if (selected === undefined) {
      return false;
    }
    const draft = this.draft();
    return (
      draft.tier !== selected.tier ||
      draft.pool !== selected.pool ||
      eurosToMinorUnits(draft.priceEur) !== selected.price.minorUnits
    );
  });

  /**
   * Signal Forms over the draft — the price field binds through it; tier and pool are toggle buttons.
   * The euros string is validated by parsing it on save, the way the sibling operator forms treat their
   * numeric fields, so an empty field reads as "no change" rather than as €0.
   */
  protected readonly draftForm = form(this.draft, (path) => {
    disabled(path.priceEur, { when: () => this.busy() });
  });

  /**
   * The grid extent: the sets' own bounding box plus whatever the operator has grown it by, at least
   * one cell so an empty venue still renders, and never past the maxima the server enforces (R-4).
   */
  protected readonly rowCount = computed(() =>
    clampGrid(Math.max(1, ...this.sets().map((s) => s.gridY)) + this.extraRows(), 1, MAX_ROWS),
  );
  protected readonly colCount = computed(() =>
    clampGrid(Math.max(1, ...this.sets().map((s) => s.gridX)) + this.extraCols(), 1, MAX_COLS),
  );

  protected readonly canAddRow = computed(() => this.rowCount() < MAX_ROWS);
  protected readonly canAddCol = computed(() => this.colCount() < MAX_COLS);

  /** The rendered grid: one entry per position, carrying its set (if any), state and AT label. */
  protected readonly rows = computed(() => {
    const bySlot = new Map(this.sets().map((s) => [slot(s.gridX, s.gridY), s]));
    const selectedId = this.selectedSet()?.id;
    const cell = this.selectedCell();
    const moving = this.armed();
    return Array.from({ length: this.rowCount() }, (_, y) => ({
      label: gridRowLabel(y),
      cells: Array.from({ length: this.colCount() }, (_, x) => {
        const gridX = x + 1;
        const gridY = y + 1;
        const set = bySlot.get(slot(gridX, gridY));
        const state: CellState = set === undefined ? 'gap' : cellStateOf(set);
        const empty = set === undefined;
        return {
          gridX,
          gridY,
          setId: set?.id ?? null,
          state,
          selected: empty
            ? cell?.gridX === gridX && cell?.gridY === gridY
            : set.id === selectedId,
          // While a move is armed only empty cells are targets, so an occupied one offers nothing.
          disabled: moving && !empty,
          label: `Row ${gridRowLabel(y)} position ${gridX}, ${
            empty && moving ? 'empty — move here' : CELL_STATE_DESC[state]
          }`,
        };
      }),
    }));
  });

  /**
   * Whether a Move is really armed: a set must still be selected for one to mean anything. Deriving
   * it rather than trusting the flag is what keeps the arm from outliving its subject — the flag's
   * own Cancel button lives inside the selected-set panel, so an arm left standing after the
   * selection collapses (a removal, most obviously) would disable every occupied cell and route
   * every empty one into a move with nothing to move: a silently inert grid with no way out.
   */
  protected readonly armed = computed(() => this.moving() && this.selectedSet() !== undefined);

  /** Whether the panel has something to edit — a saved set, or an empty cell to add into. */
  protected readonly hasSelection = computed(
    () => this.selectedSet() !== undefined || this.selectedCell() !== undefined,
  );

  /** The selection's identity line — what the guest is told, so it is never silently rewritten. */
  protected readonly selectedLabel = computed(() => {
    const selected = this.selectedSet();
    if (selected !== undefined) {
      return `Row ${selected.rowLabel} · position ${selected.positionNo}`;
    }
    const cell = this.selectedCell();
    return cell === undefined ? '' : `Row ${gridRowLabel(cell.gridY - 1)} · position ${cell.gridX}`;
  });

  protected readonly tiers: readonly { key: Tier; label: string }[] = [
    { key: 'PREMIUM', label: 'Front row · premium' },
    { key: 'STANDARD', label: 'Standard' },
  ];

  protected readonly pools: readonly { key: Pool; label: string }[] = [
    { key: 'ONLINE', label: 'Online' },
    { key: 'WALK_IN', label: 'Walk-in' },
  ];

  /**
   * A grid cell was activated. While a move is armed an empty cell is the destination; otherwise a
   * cell selects its set, or offers to add one where there is none.
   */
  protected onCell(gridX: number, gridY: number, setId: number | null): void {
    if (this.armed()) {
      if (setId === null) {
        void this.onMoveTo(gridX, gridY);
      }
      return;
    }
    this.selection.set(setId === null ? { kind: 'cell', gridX, gridY } : { kind: 'set', setId });
    this.saved.set(false);
    this.errorCode.set(undefined);
    this.confirmRemove.set(false);
    this.moving.set(false);
  }

  protected addRow(): void {
    this.extraRows.update((extra) => extra + 1);
  }

  protected addCol(): void {
    this.extraCols.update((extra) => extra + 1);
  }

  protected armMove(): void {
    this.moving.set(true);
    this.saved.set(false);
    this.errorCode.set(undefined);
  }

  protected cancelMove(): void {
    this.moving.set(false);
  }

  /** Place the selected set on `(gridX, gridY)`, carrying its SAVED tier, pool and price. */
  private async onMoveTo(gridX: number, gridY: number): Promise<void> {
    const selected = this.selectedSet();
    if (selected === undefined || this.busy()) {
      return;
    }
    this.moving.set(false);
    await this.write(() =>
      this.console.editSet(this.venueId(), selected.id, {
        ...placementAt(gridX, gridY),
        tier: selected.tier,
        pool: selected.pool,
        price: selected.price,
      }),
    );
  }

  /** Place a brand-new set on the selected empty cell. */
  protected async onAdd(): Promise<void> {
    const cell = this.selectedCell();
    if (cell === undefined || this.busy()) {
      return;
    }
    const draft = this.draft();
    const minorUnits = eurosToMinorUnits(draft.priceEur);
    if (minorUnits === null) {
      this.errorCode.set('INVALID_REQUEST');
      return;
    }
    await this.write(
      () =>
        this.console.addSet(this.venueId(), {
          ...placementAt(cell.gridX, cell.gridY),
          tier: draft.tier,
          pool: draft.pool,
          price: { minorUnits, currency: draft.currency },
        }),
      (created) => this.selection.set({ kind: 'set', setId: created.id }),
    );
  }

  protected chooseTier(tier: Tier): void {
    this.draft.update((draft) => ({ ...draft, tier }));
  }

  protected choosePool(pool: Pool): void {
    this.draft.update((draft) => ({ ...draft, pool }));
  }

  /** Save the selected set: the whole body, with the euros field converted at the edge (invariant #5). */
  protected async onSave(): Promise<void> {
    const selected = this.selectedSet();
    if (selected === undefined || this.busy()) {
      return;
    }
    const draft = this.draft();
    const minorUnits = eurosToMinorUnits(draft.priceEur);
    if (minorUnits === null) {
      // A cleared or non-numeric field is "no change", never a €0 set — the same rule the Pricing tab keeps.
      this.errorCode.set('INVALID_REQUEST');
      return;
    }
    const request: SetWriteRequest = {
      rowLabel: selected.rowLabel,
      positionNo: selected.positionNo,
      tier: draft.tier,
      pool: draft.pool,
      price: { minorUnits, currency: draft.currency },
      gridX: selected.gridX,
      gridY: selected.gridY,
    };
    await this.write(() => this.console.editSet(this.venueId(), selected.id, request));
  }

  /**
   * Open the remove confirmation, or close it, moving focus with the surface. Each transition
   * destroys the element that was just activated, which strands keyboard/AT focus on `<body>` unless
   * it is moved deliberately (WCAG 2.4.3) — the same treatment the admin photo takedown carries.
   */
  protected askRemove(): void {
    this.confirmRemove.set(true);
    this.focusAfterRender('set-remove-yes');
  }

  protected cancelRemove(): void {
    this.confirmRemove.set(false);
    this.focusAfterRender('set-remove');
  }

  /**
   * Remove the selected set. On success the selection is dropped here rather than waiting for the
   * parent's re-read: the set is gone the moment the server says so, and leaving it selected would
   * offer an edit panel over nothing.
   */
  protected async onRemove(): Promise<void> {
    const selected = this.selectedSet();
    if (selected === undefined || this.busy()) {
      return;
    }
    this.confirmRemove.set(false);
    await this.write(
      () => this.console.removeSet(this.venueId(), selected.id),
      () => {
        this.selection.set(null);
        this.moving.set(false);
        // Both the confirm and the Remove button are gone with the selection, so focus parks on the panel.
        this.focusAfterRender('set-panel');
      },
    );
  }

  /** The operator-facing message for the current failure, or undefined. */
  protected errorMessage(): string | undefined {
    switch (this.errorCode()) {
      case undefined:
        return undefined;
      case 'SET_IN_USE':
        return 'This set is booked or held, so it can’t be moved, repooled or removed. Its price and tier can still change.';
      case 'CELL_TAKEN':
      case 'DUPLICATE_POSITION':
        return 'Another set already occupies that spot. Reload the tab and pick a free one.';
      case 'NO_SUCH_SET':
        return 'This set no longer exists. Reload the tab to see the current map.';
      case 'NO_SUCH_VENUE':
        return 'This venue could not be found.';
      case 'NOT_VENUE_OWNER':
        return 'You do not manage this venue, so its map can’t be changed.';
      case 'INVALID_REQUEST':
        return 'That price is not valid. Enter an amount of €0 or more.';
      case 'UNAUTHORIZED':
        return 'Your session has expired. Please sign in again.';
      default:
        return 'Something went wrong saving this set. Please try again.';
    }
  }

  /**
   * Run one per-set write: on success run {@link onApplied} and announce {@link changed} so the
   * parent re-reads (the ONLY way this grid changes); on failure surface the code and leave the map
   * untouched. The follow-up rides the success path rather than a resolved promise the caller awaits,
   * so it lands in the same turn as the announcement — and never at all for a superseded write.
   */
  private async write<T>(call: () => Observable<T>, onApplied?: (result: T) => void): Promise<void> {
    const venueId = this.venueId();
    this.busy.set(true);
    this.saved.set(false);
    this.errorCode.set(undefined);
    try {
      const result = await firstValueFrom(call());
      if (this.venueId() !== venueId) {
        return; // a venue switch superseded this write; busy still clears in finally
      }
      onApplied?.(result);
      this.saved.set(true);
      this.changed.emit();
    } catch (error) {
      if (this.venueId() !== venueId) {
        return;
      }
      const code = setWriteErrorOf(error);
      this.errorCode.set(code);
      if (code === 'UNAUTHORIZED') {
        this.operator.sessionLost();
      }
    } finally {
      this.busy.set(false);
    }
  }

  private focusAfterRender(testId: string): void {
    afterNextRender(
      {
        earlyRead: () =>
          this.hostRef.nativeElement.querySelector<HTMLElement>(`[data-testid="${testId}"]`),
        write: (target) => target?.focus(),
      },
      { injector: this.injector },
    );
  }
}

function slot(gridX: number, gridY: number): string {
  return `${gridX},${gridY}`;
}

/**
 * The row label and position number a grid cell implies — the same derivation the bulk editor uses,
 * so a set placed here reads to the guest exactly as one generated there would.
 */
function placementAt(gridX: number, gridY: number): Pick<SetWriteRequest, 'rowLabel' | 'positionNo' | 'gridX' | 'gridY'> {
  return { rowLabel: gridRowLabel(gridY - 1), positionNo: gridX, gridX, gridY };
}
