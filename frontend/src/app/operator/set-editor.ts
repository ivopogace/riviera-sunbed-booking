import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  Injector,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { disabled, form, FormField } from '@angular/forms/signals';
import { firstValueFrom, Observable } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { LoadAnnouncer } from '../shared/load-announcer';
import { ConfirmPanel } from '../shared/confirm-panel';
import { focusMover } from '../shared/focus-after-render';
import { eurosToMinorUnits, formatMoney, minorUnitsToEuros, MoneyView } from '../shared/money';
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
import { BeachMapCanvas, BeachMapCanvasRow, BeachMapRowDef } from '../shared/beach-map-canvas';
import { MAP_SKELETON_ROWS, MAP_SKELETON_TILES } from '../shared/map-skeleton';
import { SkeletonBlock } from '../shared/skeleton-block';
import {
  LayoutCellRequest,
  LayoutErrorCode,
  SetWriteErrorCode,
  SetWriteRequest,
} from './operator-console.model';
import { layoutErrorOf, OperatorConsoleService, setWriteErrorOf } from './operator-console.service';

import { TouchTarget } from '../shared/touch-target';

/** One editor row on the shared canvas's row contract, plus the cells the panel selects from. */
interface SetRow extends BeachMapCanvasRow {
  readonly cells: readonly {
    readonly gridX: number;
    readonly gridY: number;
    readonly setId: number | null;
    readonly state: CellState;
    readonly selected: boolean;
    readonly disabled: boolean;
    readonly label: string;
  }[];
}

/** What the panel is editing: one saved set, one empty cell to add into, or nothing. */
type Selection =
  | { readonly kind: 'set'; readonly setId: number }
  | { readonly kind: 'cell'; readonly gridX: number; readonly gridY: number }
  | null;

/** A drag-sweep's grid bounding box, inclusive on every edge. */
interface SweepRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * The batch editor's draft: `null`/`''` means the operator has not touched that field, so it
 * is left off the apply entirely (invariant per #714: untouched fields keep each set's own
 * value). Distinct from {@link SetDraft}, whose fields are always fully seeded — a batch draft
 * starts, and can return to, "nothing chosen yet".
 */
interface BatchDraft {
  readonly tier: Tier | null;
  readonly pool: Pool | null;
  readonly priceEur: string;
}

const EMPTY_BATCH_DRAFT: BatchDraft = { tier: null, pool: null, priceEur: '' };

/** How far (px) a swipe-down on the mobile bottom sheet's handle must travel before release closes it. */
const SHEET_DISMISS_THRESHOLD_PX = 80;

/** Every saved set whose grid position falls inside `rect`, inclusive. */
function setsInRect(sets: readonly SetView[], rect: SweepRect): readonly SetView[] {
  return sets.filter(
    (s) =>
      s.gridX >= rect.minX && s.gridX <= rect.maxX && s.gridY >= rect.minY && s.gridY <= rect.maxY,
  );
}

/**
 * Which per-set write was attempted. `SET_IN_USE` answers two guards of different breadth — an edit
 * refuses only for a live claim, a remove for any booking ever — so the refusal copy is chosen by
 * action, not by code alone. `save` stays the neutral name: it sends pool alongside a placement
 * snapshot that another tab may already have moved, so which field tripped the server is unknowable
 * here and the copy names the frozen group rather than guessing the operator's intent.
 */
type SetWrite = 'add' | 'move' | 'save' | 'remove';

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
  imports: [
    CardGlass,
    BeachMapCanvas,
    BeachMapRowDef,
    SkeletonBlock,
    BeachCell,
    ConfirmPanel,
    FormField,
    BusyAction,
    LoadAnnouncer,
    TouchTarget,
  ],
  templateUrl: './set-editor.html',
  host: {
    '(keydown.escape)': 'onEscape()',
    '(document:mouseup)': 'onSweepEnd()',
  },
})
export class SetEditor {
  private readonly console = inject(OperatorConsoleService);
  private readonly focusAfterRender = focusMover();
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly operator = inject(OperatorAuth);

  /** The venue whose map is being edited — owner-asserted server-side on every write (invariant #13). */
  readonly venueId = input.required<number>();
  /** The venue's saved sets, from the parent's map read. Replacing this re-seeds selection and draft. */
  readonly sets = input.required<readonly SetView[]>();
  /**
   * Whether {@link sets} is the settled answer from the parent's map read. Required, not defaulted:
   * an unread map is not an empty venue, and every caller has to say which one it is holding. While
   * it is false the surface renders a skeleton instead of a 1×1 grid and the no-sets copy.
   */
  readonly loaded = input.required<boolean>();
  /**
   * The optimistic-concurrency token loaded with the map (`setVersion`) — required so a batch
   * apply can never fire without it, exactly the same guard {@link LayoutEditor}'s own bulk save
   * enforces. `null` while the parent's initial read hasn't landed or has failed.
   */
  readonly expectedVersion = input.required<number | null>();
  /** A write landed: the parent drops the shared console snapshot and re-reads the map. */
  readonly changed = output<void>();
  /**
   * A batch apply lost the optimistic-concurrency race (`409 STALE_WRITE`) — the parent renders
   * its existing reload-recovery banner and drives {@link LayoutEditor.reloadAfterStale}; this
   * component keeps the sweep selection and draft untouched until that Reload lands (AC-4).
   */
  readonly staleWrite = output<void>();

  /** True while a per-set write is in flight — the panel's actions are disabled, so no double submit. */
  protected readonly busy = signal(false);
  /** Set after a successful write, cleared when the next one starts or the selection moves. */
  protected readonly saved = signal(false);
  /** The last write failure, mapped to operator-facing copy, or undefined. */
  protected readonly errorCode = signal<SetWriteErrorCode | undefined>(undefined);

  /** Which write {@link errorCode} answers — read only for `SET_IN_USE`, whose breadth varies by action. */
  private readonly attempted = signal<SetWrite | undefined>(undefined);
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

  /**
   * The batch-selected set ids from a drag sweep (#714) — mutually exclusive with
   * {@link selection}; either every `onCell` tap or a new sweep clears the other. The same
   * "account for previous state" `linkedSignal` shape as {@link selection}: a re-read that drops
   * one of the selected ids (another tab removed it) empties the whole sweep rather than leaving
   * it half-valid, since the batch panel's "N sets" count would otherwise silently go stale.
   */
  protected readonly sweepIds = linkedSignal<readonly SetView[], ReadonlySet<number> | null>({
    source: this.sets,
    computation: (sets, previous) => {
      const chosen = previous?.value;
      if (chosen === null || chosen === undefined) {
        return null;
      }
      const ids = new Set(sets.map((s) => s.id));
      return [...chosen].every((id) => ids.has(id)) ? chosen : null;
    },
  });

  /** The sets a live sweep currently covers — the batch panel's own rows. */
  protected readonly sweptSets = computed(() => {
    const ids = this.sweepIds();
    return ids === null ? [] : this.sets().filter((s) => ids.has(s.id));
  });

  /**
   * "Row A–B · positions 1–2" (or a single row/position when the sweep covers only one). Only
   * ever read from the template inside the sweep-active branch, where {@link sweptSets} is never
   * empty — {@link sweepIds}'s own invariant guarantees every id in it still has a backing set.
   */
  protected readonly sweepRangeLabel = computed(() => {
    const swept = this.sweptSets();
    const minY = Math.min(...swept.map((s) => s.gridY));
    const maxY = Math.max(...swept.map((s) => s.gridY));
    const minX = Math.min(...swept.map((s) => s.gridX));
    const maxX = Math.max(...swept.map((s) => s.gridX));
    const rows =
      minY === maxY
        ? `Row ${gridRowLabel(minY - 1)}`
        : `Rows ${gridRowLabel(minY - 1)}–${gridRowLabel(maxY - 1)}`;
    const positions = minX === maxX ? `position ${minX}` : `positions ${minX}–${maxX}`;
    return `${rows} · ${positions}`;
  });

  /** What AT hears when the sweep changes size — empty while nothing is swept (#714). */
  protected readonly sweepAnnouncement = computed(() => {
    const count = this.sweptSets().length;
    if (count === 0) {
      return '';
    }
    const noun = count === 1 ? 'set' : 'sets';
    return `${count} ${noun} selected`;
  });

  /** The batch draft, re-seeded blank whenever the sweep changes (a new sweep, a clear, or a
   *  successful apply re-reading the sets the sweep is keyed on). */
  protected readonly batchDraft = linkedSignal<ReadonlySet<number> | null, BatchDraft>({
    source: this.sweepIds,
    computation: () => EMPTY_BATCH_DRAFT,
  });

  /** True while the batch PUT is in flight — the panel's controls are disabled. */
  protected readonly batchBusy = signal(false);
  /** Set after a successful batch apply, cleared on the next sweep/apply. */
  protected readonly batchSaved = signal(false);
  /** The last batch-apply failure, mapped to operator-facing copy, or undefined. */
  protected readonly batchErrorCode = signal<LayoutErrorCode | undefined>(undefined);

  /**
   * Where the inspector last stood, kept even after {@link selection} collapses. `selection` can
   * drop to `null` on its own — a re-read that no longer carries the picked set, e.g. from another
   * tab or operator — with no `closeSelection()` call to carry the focus move, so the constructor's
   * effect below uses this to reclaim focus a silent collapse would otherwise strand on `<body>`.
   */
  private readonly lastCoords = signal<{ gridX: number; gridY: number } | undefined>(undefined);

  // --- drag-sweep gesture (#714; imperative, not rendered — mirrors LayoutEditor's own drag-paint) ---

  /** True from a primary-button press on a cell until the matching `document:mouseup`. */
  private sweeping = false;
  /** Every `(gridX, gridY)` the pointer has entered this gesture, keyed `"x,y"`. */
  private sweptCoords = new Set<string>();
  /** The gesture's starting cell — a browser fires `click` only when the release lands back on
   *  this same cell; any other release fires no click on either endpoint at all. */
  private sweepStartKey = '';
  /** The most recently entered cell — compared against {@link sweepStartKey} on release. */
  private sweepLastKey = '';
  /** True once {@link sweptCoords} has grown past the starting cell — the click/drag fork. */
  private sweepDidDrag = false;
  /** Set when a committed sweep's release lands back on its own starting cell, so the click that
   *  follows doesn't also single-select that tile. A release on any OTHER cell fires no click at
   *  all (mousedown/mouseup on different elements never synthesize one), so this is never armed
   *  for the ordinary cross-cell drag. */
  private suppressNextClick = false;

  /** afterRenderEffect, not effect: the DOM read below must run after the panel is actually gone. */
  constructor() {
    afterRenderEffect(() => {
      if (!this.hasSelection()) {
        this.reclaimStrandedFocus();
      }
    });
  }

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

  /**
   * The rendered grid on the shared canvas's row contract: one entry per position, carrying its set
   * (if any), state and AT label. Every row is a zone of its own (`zoneStart: true`) — the bulk
   * editor's posture, so the tab's two modes keep one row rhythm — chipped with the price of the
   * row's first set (a live per-set reprice updates the chip in place; rows never reflow).
   */
  protected readonly rows = computed<readonly SetRow[]>(() => {
    const bySlot = new Map(this.sets().map((s) => [slot(s.gridX, s.gridY), s]));
    const selectedId = this.selectedSet()?.id;
    const cell = this.selectedCell();
    const moving = this.armed();
    const swept = this.sweepIds();
    return Array.from({ length: this.rowCount() }, (_, y) => {
      const cells = Array.from({ length: this.colCount() }, (_, x) => {
        const gridX = x + 1;
        const gridY = y + 1;
        const set = bySlot.get(slot(gridX, gridY));
        const state: CellState = set === undefined ? 'gap' : cellStateOf(set);
        const empty = set === undefined;
        const selected = empty
          ? cell?.gridX === gridX && cell?.gridY === gridY
          : set.id === selectedId || (swept?.has(set.id) ?? false);
        return {
          gridX,
          gridY,
          setId: set?.id ?? null,
          state,
          selected,
          // While a move is armed only empty cells are targets, so an occupied one offers nothing.
          disabled: moving && !empty,
          label: `Row ${gridRowLabel(y)} position ${gridX}, ${
            empty && moving ? 'empty — move here' : CELL_STATE_DESC[state]
          }`,
        };
      });
      const first = cells.find((c) => c.setId !== null);
      const firstSet = first === undefined ? undefined : bySlot.get(slot(first.gridX, first.gridY));
      return {
        code: gridRowLabel(y),
        priceLabel: firstSet === undefined ? null : formatMoney(firstSet.price),
        zoneStart: true,
        tileCount: cells.length,
        cells,
      };
    });
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

  /** The mobile bottom sheet's live drag offset (px, never negative) — 0 while not being dragged. */
  protected readonly sheetDragDeltaY = signal(0);
  /** The pointer's Y at the drag's start, or null while no drag is in progress. */
  private sheetDragStartY: number | null = null;

  /** The remove confirmation's warning, naming the set the operator picked. */
  protected readonly removeMessage = computed(
    () =>
      `Remove ${this.selectedLabel()} from the map? A set that is booked, or held from today on, can’t be removed.`,
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

  /** The in-flight skeleton's geometry, shared with every other beach-map surface (#744). */
  protected readonly skeletonTiles = MAP_SKELETON_TILES;
  protected readonly skeletonRows = MAP_SKELETON_ROWS;

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
   * cell selects its set, opens the docked inspector, or offers to add one where there is none.
   * Re-clicking the already-selected tile is a no-op — it re-affirms the selection, the way it always
   * has (growing the grid and re-tapping a just-picked cell is a routine flow, not a request to close).
   */
  protected onCell(gridX: number, gridY: number, setId: number | null): void {
    if (this.suppressNextClick) {
      // A sweep just committed on mouseup — its own click mustn't re-select the released tile.
      this.suppressNextClick = false;
      return;
    }
    if (this.armed()) {
      if (setId === null) {
        void this.onMoveTo(gridX, gridY);
      }
      return;
    }
    const opening = this.selection() === null;
    this.selection.set(setId === null ? { kind: 'cell', gridX, gridY } : { kind: 'set', setId });
    this.lastCoords.set({ gridX, gridY });
    this.saved.set(false);
    this.errorCode.set(undefined);
    this.confirmRemove.set(false);
    this.moving.set(false);
    this.sweepIds.set(null); // a single tap always supersedes any standing batch sweep (AC-6)
    if (opening) {
      // The mobile bottom sheet can cover the lower viewport — keep the tapped tile above it (#715).
      this.scrollCellIntoView(gridX, gridY);
      // A brand-new inspector appeared — move focus into it so AT users notice its arrival.
      this.focusAfterRender('set-panel');
    }
  }

  /**
   * A cell's primary-button press: arms the drag-sweep gesture (#714) unless a move is armed or a
   * remove confirmation is open, in which case a drag has no meaning and this is a no-op — the
   * subsequent `click` still drives {@link onCell}'s existing move/no-op handling.
   */
  protected onCellMouseDown(gridX: number, gridY: number, event: MouseEvent): void {
    if (event.button !== 0 || this.armed() || this.confirmRemove()) {
      return;
    }
    this.sweeping = true;
    this.sweepDidDrag = false;
    this.sweepStartKey = slot(gridX, gridY);
    this.sweepLastKey = this.sweepStartKey;
    this.sweptCoords = new Set([this.sweepStartKey]);
  }

  /** A cell re-entered mid-drag: extend the sweep, or disarm on a stale flag (off-window release). */
  protected onCellMouseEnter(gridX: number, gridY: number, event: MouseEvent): void {
    if (!this.sweeping) {
      return;
    }
    if ((event.buttons & 1) === 0) {
      this.sweeping = false;
      return;
    }
    this.sweepLastKey = slot(gridX, gridY);
    this.sweptCoords.add(this.sweepLastKey);
    if (this.sweptCoords.size > 1) {
      this.sweepDidDrag = true;
    }
  }

  /**
   * The gesture's end (`document:mouseup`, so an off-tile release still lands it). A single-cell
   * "drag" is really just a click and is left entirely to {@link onCell}; only a genuine multi-cell
   * drag commits a sweep. Suppression is armed only when the release lands back on the starting
   * cell — the one case a click actually follows; any other release fires no click at all.
   */
  protected onSweepEnd(): void {
    if (this.sweeping && this.sweepDidDrag) {
      this.commitSweep();
      this.suppressNextClick = this.sweepLastKey === this.sweepStartKey;
    }
    this.sweeping = false;
    this.sweptCoords.clear();
  }

  /** Turn the swept coordinates into a batch selection: every saved set inside their bounding box. */
  private commitSweep(): void {
    const rect = boundingRect(this.sweptCoords);
    const swept = setsInRect(this.sets(), rect);
    const ids = new Set(swept.map((s) => s.id));
    if (ids.size === 0) {
      return; // an all-empty rectangle has nothing to batch-edit
    }
    this.selection.set(null);
    this.moving.set(false);
    this.confirmRemove.set(false);
    this.saved.set(false);
    this.errorCode.set(undefined);
    this.sweepIds.set(ids);
    this.batchSaved.set(false);
    this.batchErrorCode.set(undefined);
    // Keep the swept anchor above the mobile bottom sheet too (#715), same reasoning as onCell.
    this.scrollCellIntoView(swept[0].gridX, swept[0].gridY);
    this.focusAfterRender('batch-panel');
  }

  /**
   * Empty the sweep (Clear or Escape) and return focus to the canvas (AC-5), never `<body>`. Only
   * ever called while a sweep is active, so {@link sweptSets} is never empty — the same invariant
   * {@link sweepRangeLabel} relies on.
   */
  protected clearSweep(): void {
    const anchor = this.sweptSets()[0];
    this.sweepIds.set(null);
    this.batchErrorCode.set(undefined);
    this.batchSaved.set(false);
    this.focusCell(anchor.gridX, anchor.gridY);
  }

  protected chooseBatchTier(tier: Tier): void {
    this.batchDraft.update((draft) => ({ ...draft, tier }));
  }

  protected chooseBatchPool(pool: Pool): void {
    this.batchDraft.update((draft) => ({ ...draft, pool }));
  }

  protected onBatchPriceInput(value: string): void {
    this.batchDraft.update((draft) => ({ ...draft, priceEur: value }));
  }

  /** Whether the batch draft has at least one touched field — Apply is inert until it does. */
  protected readonly batchHasChanges = computed(() => {
    const draft = this.batchDraft();
    return draft.tier !== null || draft.pool !== null || draft.priceEur.trim() !== '';
  });

  /**
   * Apply the batch draft's touched fields to every swept set, via the SAME bulk `PUT
   * …/beach-map` {@link LayoutEditor.onSave} drives (AC-3) — one write, `expectedVersion`-guarded,
   * built from every one of this venue's OWN sets ({@link sets}, the parent's last read) so an
   * untouched field on an untouched set is never even re-sent as anything but its own value
   * (AC-2). A touched-but-empty price is a no-op for that field, matching the single-set panel's
   * "cleared field reads as no change" convention — not a validation error.
   */
  protected async applyBatch(): Promise<void> {
    const venueId = this.venueId();
    const ids = this.sweepIds();
    const expectedVersion = this.expectedVersion();
    if (ids === null || ids.size === 0 || this.batchBusy() || expectedVersion === null) {
      return;
    }
    const draft = this.batchDraft();
    const touchedPrice = draft.priceEur.trim() === '' ? null : eurosToMinorUnits(draft.priceEur);
    if (draft.priceEur.trim() !== '' && touchedPrice === null) {
      this.batchErrorCode.set('INVALID_REQUEST');
      return;
    }
    const requestSets: LayoutCellRequest[] = this.sets().map((s) => {
      const touched = ids.has(s.id);
      const price: MoneyView =
        touched && touchedPrice !== null
          ? { minorUnits: touchedPrice, currency: s.price.currency }
          : s.price;
      return {
        rowLabel: s.rowLabel,
        positionNo: s.positionNo,
        tier: touched && draft.tier !== null ? draft.tier : s.tier,
        pool: touched && draft.pool !== null ? draft.pool : s.pool,
        price,
        gridX: s.gridX,
        gridY: s.gridY,
      };
    });
    this.batchBusy.set(true);
    this.batchSaved.set(false);
    this.batchErrorCode.set(undefined);
    try {
      await firstValueFrom(
        this.console.replaceLayout(venueId, { sets: requestSets, expectedVersion }),
      );
      if (this.venueId() !== venueId || this.sweepIds() !== ids) {
        return; // a venue switch or a fresh sweep superseded this apply; batchBusy still clears in finally
      }
      this.batchSaved.set(true);
      this.batchDraft.set(EMPTY_BATCH_DRAFT);
      this.changed.emit();
    } catch (error) {
      if (this.venueId() !== venueId || this.sweepIds() !== ids) {
        return;
      }
      const code = layoutErrorOf(error);
      this.batchErrorCode.set(code);
      if (code === 'STALE_WRITE') {
        this.staleWrite.emit(); // the parent's reload banner owns recovery; the sweep is kept (AC-4)
      } else if (code === 'UNAUTHORIZED') {
        this.operator.sessionLost();
      }
    } finally {
      this.batchBusy.set(false);
    }
  }

  /**
   * The operator-facing message for the current batch-apply failure, or undefined. Its own
   * {@link LayoutErrorCode} switch, distinct from {@link LayoutEditor}'s `errorMessage()` — a
   * `LAYOUT_IN_USE` here points the operator at editing one set at a time, which is what they are
   * already doing, where the bulk save's own copy points them at arming Select instead.
   */
  protected batchErrorMessage(): string | undefined {
    switch (this.batchErrorCode()) {
      case undefined:
        return undefined;
      case 'STALE_WRITE':
        return undefined; // rendered by the parent's stale-write banner instead
      case 'LAYOUT_IN_USE':
        return 'This venue has been booked at least once, or some of its sets are still held, so a batch apply is locked. Change price, tier or pool one set at a time instead.';
      case 'INVALID_REQUEST':
        return 'That price is not valid. Enter an amount of €0 or more, or leave it blank to leave prices unchanged.';
      case 'NO_SUCH_VENUE':
        return 'This venue could not be found.';
      case 'UNAUTHORIZED':
        return 'Your session has expired. Please sign in again.';
      default:
        return 'Something went wrong applying the change. Please try again.';
    }
  }

  /** Close the docked inspector via its own Close control — the mouse counterpart to Escape. */
  protected closeInspector(): void {
    const coords = this.selectionCoords();
    if (coords !== undefined) {
      this.closeSelection(coords.gridX, coords.gridY);
    }
  }

  /** Dismiss whichever sheet is open (a mobile-sheet backdrop tap or swipe-down) — the batch panel
   *  clears its sweep, the single-set panel closes exactly like {@link closeInspector}. */
  protected dismissSheet(): void {
    if (this.sweepIds() !== null) {
      this.clearSweep();
      return;
    }
    this.closeInspector();
  }

  /** A drag on the sheet's handle started (mobile bottom sheet only) — pointer capture keeps every
   *  later move/up routed here even once the finger leaves the small handle. */
  protected onSheetDragStart(event: PointerEvent): void {
    this.sheetDragStartY = event.clientY;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  /** Track the drag distance so the sheet visibly follows the finger; never negative — the sheet
   *  only slides toward dismissal, not up past its resting position. */
  protected onSheetDragMove(event: PointerEvent): void {
    if (this.sheetDragStartY === null) {
      return;
    }
    this.sheetDragDeltaY.set(Math.max(0, event.clientY - this.sheetDragStartY));
  }

  /** Past the dismiss threshold, releasing closes the sheet; short of it, it springs back. */
  protected onSheetDragEnd(event: PointerEvent): void {
    const delta = this.sheetDragDeltaY();
    this.sheetDragStartY = null;
    this.sheetDragDeltaY.set(0);
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    if (delta > SHEET_DISMISS_THRESHOLD_PX) {
      this.dismissSheet();
    }
  }

  /**
   * Escape closes the docked inspector — the keyboard counterpart to {@link closeInspector}. Bound on
   * the component host, not `document`, so it only fires while focus is inside this surface (the
   * `find-booking.ts` precedent for a scoped dismiss key). A move or a remove-confirmation in progress
   * is cancelled first, since either would otherwise silently survive the close.
   */
  protected onEscape(): void {
    if (this.sweepIds() !== null) {
      this.clearSweep();
      return;
    }
    if (this.confirmRemove()) {
      this.cancelRemove();
      return;
    }
    if (this.armed()) {
      this.cancelMove();
      return;
    }
    const coords = this.selectionCoords();
    if (coords !== undefined) {
      this.closeSelection(coords.gridX, coords.gridY);
    }
  }

  /** The grid position the current selection occupies, or undefined for no selection. */
  private selectionCoords(): { gridX: number; gridY: number } | undefined {
    const chosen = this.selection();
    if (chosen === null) {
      return undefined;
    }
    if (chosen.kind === 'cell') {
      return chosen;
    }
    const selected = this.selectedSet();
    return selected === undefined ? undefined : { gridX: selected.gridX, gridY: selected.gridY };
  }

  /** Close the inspector and return focus to the tile it was open for (WCAG 2.4.3) — the panel
   *  itself is destroyed by every path that reaches here. */
  private closeSelection(gridX: number, gridY: number): void {
    this.selection.set(null);
    this.moving.set(false);
    this.confirmRemove.set(false);
    this.focusCell(gridX, gridY);
  }

  /**
   * Focus one grid tile once the next render has committed. The shared `focusMover()` targets a
   * fixed `data-testid` landmark; this targets a specific tile chosen at runtime, so it repeats that
   * utility's `afterNextRender`-based idiom directly rather than forcing a per-instance testid onto
   * every cell (which every bulk selector in the specs/e2e assumes share one `data-testid`).
   */
  private focusCell(gridX: number, gridY: number): void {
    afterNextRender(
      {
        earlyRead: () =>
          this.hostEl.nativeElement.querySelector<HTMLElement>(
            `[data-testid="set-cell"][data-grid-x="${gridX}"][data-grid-y="${gridY}"]`,
          ),
        write: (target) => target?.focus(),
      },
      { injector: this.injector },
    );
  }

  /**
   * Scroll the page (only the page — never `scrollIntoView`, which would also nudge the map's own
   * internal overflow-hidden viewport and risk clipping an unrelated row) so one grid tile clears
   * its own `scroll-margin-bottom` (the mobile bottom sheet's height). The read-only counterpart to
   * {@link focusCell}, called instead of it wherever the tile itself, not the panel, must stay visible.
   */
  private scrollCellIntoView(gridX: number, gridY: number): void {
    afterNextRender(
      {
        earlyRead: () =>
          this.hostEl.nativeElement.querySelector<HTMLElement>(
            `[data-testid="set-cell"][data-grid-x="${gridX}"][data-grid-y="${gridY}"]`,
          ),
        write: (target) => {
          if (target === null) {
            return;
          }
          const box = target.getBoundingClientRect();
          const marginBottom = Number.parseFloat(getComputedStyle(target).scrollMarginBottom) || 0;
          const overflow = box.bottom + marginBottom - window.innerHeight;
          if (overflow > 0) {
            window.scrollBy({ top: overflow });
          }
        },
      },
      { injector: this.injector },
    );
  }

  /**
   * A safety net for a selection that collapses on its own — {@link selection}'s `linkedSignal`
   * drops it to `null` the moment a re-read no longer carries the picked set, with no
   * {@link closeSelection} call to move focus along. If that left focus outside this component's own
   * host (the panel it was in is already gone), redirect it to the last tile the inspector was open
   * for; a user-driven close already parked focus on that tile, so this is then a no-op.
   */
  private reclaimStrandedFocus(): void {
    const coords = this.lastCoords();
    const active = document.activeElement;
    // A removed element leaves focus on <body> in a real browser, detached (unreset) in jsdom.
    const stranded =
      coords !== undefined && (active === null || active === document.body || !active.isConnected);
    if (stranded) {
      this.focusCell(coords.gridX, coords.gridY);
    }
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
    await this.write('move', () =>
      this.console.editSet(this.venueId(), selected.id, {
        ...placementAt(gridX, gridY, this.sets()),
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
      'add',
      () =>
        this.console.addSet(this.venueId(), {
          ...placementAt(cell.gridX, cell.gridY, this.sets()),
          tier: draft.tier,
          pool: draft.pool,
          price: { minorUnits, currency: draft.currency },
        }),
      (created) => {
        this.selection.set({ kind: 'set', setId: created.id });
        this.lastCoords.set({ gridX: cell.gridX, gridY: cell.gridY });
      },
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
    await this.write('save', () => this.console.editSet(this.venueId(), selected.id, request));
  }

  /**
   * Open the remove confirmation, or close it, moving focus with the surface. Each transition
   * destroys the element that was just activated, which strands keyboard/AT focus on `<body>` unless
   * it is moved deliberately (WCAG 2.4.3). Focus INTO the confirmation is {@link ConfirmPanel}'s
   * own doing; only the way back out is this component's, since the panel is gone by then.
   */
  protected askRemove(): void {
    this.confirmRemove.set(true);
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
      'remove',
      () => this.console.removeSet(this.venueId(), selected.id),
      // The inspector is gone with the selection, so focus parks on the now-empty tile.
      () => this.closeSelection(selected.gridX, selected.gridY),
    );
  }

  /** The operator-facing message for the current failure, or undefined. */
  protected errorMessage(): string | undefined {
    switch (this.errorCode()) {
      case undefined:
        return undefined;
      case 'SET_IN_USE':
        return this.inUseMessage();
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
   * The refusal copy for `SET_IN_USE`, which the server answers from two guards of different reach.
   * A move or save is refused only while someone is still owed the spot, so both stay
   * lifetime-neutral and point at the fields that remain editable. A remove is refused by any
   * booking that ever existed — the placement is pinned by the booking's own record — so that arm
   * says so instead of reading as a claim that will lapse.
   */
  private inUseMessage(): string {
    switch (this.attempted()) {
      case 'move':
        return 'This set is booked, or still held, so it can’t be moved. Its price and tier can still change.';
      case 'save':
        return 'This set is booked, or still held, so its pool and position can’t change. Its price and tier can still change.';
      case 'remove':
        return 'This set can’t be removed: it is still held, or it has been booked at least once — and a booked set stays on the map for good.';
      default:
        return 'This set is booked, or still held, so that change was refused.';
    }
  }

  /**
   * Run one per-set write: on success run {@link onApplied} and announce {@link changed} so the
   * parent re-reads (the ONLY way this grid changes); on failure surface the code and leave the map
   * untouched. The follow-up rides the success path rather than a resolved promise the caller awaits,
   * so it lands in the same turn as the announcement — and never at all for a superseded write.
   */
  private async write<T>(
    attempted: SetWrite,
    call: () => Observable<T>,
    onApplied?: (result: T) => void,
  ): Promise<void> {
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
      this.attempted.set(attempted);
      this.errorCode.set(code);
      if (code === 'UNAUTHORIZED') {
        this.operator.sessionLost();
      }
    } finally {
      this.busy.set(false);
    }
  }
}

function slot(gridX: number, gridY: number): string {
  return `${gridX},${gridY}`;
}

/** The smallest rectangle containing every swept coordinate (each an {@link slot} key). */
function boundingRect(coords: ReadonlySet<string>): SweepRect {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const key of coords) {
    const [x, y] = key.split(',').map(Number);
    xs.push(x);
    ys.push(y);
  }
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/**
 * The row label and position number a grid cell implies. A row that already has sets keeps its own
 * label — an operator-named row must not be split by a bare-letter newcomer; an empty row
 * takes the same grid-letter derivation the bulk editor defaults to.
 */
function placementAt(
  gridX: number,
  gridY: number,
  siblings: readonly SetView[],
): Pick<SetWriteRequest, 'rowLabel' | 'positionNo' | 'gridX' | 'gridY'> {
  const sibling = siblings.find((s) => s.gridY === gridY);
  return {
    rowLabel: sibling?.rowLabel ?? gridRowLabel(gridY - 1),
    positionNo: gridX,
    gridX,
    gridY,
  };
}
