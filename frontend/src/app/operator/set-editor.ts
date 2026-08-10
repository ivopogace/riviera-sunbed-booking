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
import { BeachCell, CELL_STATE_DESC, CellState, cellStateOf, gridRowLabel } from './beach-cell';
import { BeachGridFrame } from './beach-grid-frame';
import { SetWriteErrorCode, SetWriteRequest } from './operator-console.model';
import { OperatorConsoleService, setWriteErrorOf } from './operator-console.service';

/** What the panel is editing: one saved set, or nothing. */
type Selection = { readonly kind: 'set'; readonly setId: number } | null;

/** The editable copy of a set, seeded from the server and overwritten by the operator. */
interface SetDraft {
  readonly tier: Tier;
  readonly pool: Pool;
  readonly priceEur: string;
  readonly currency: string;
}

const EMPTY_DRAFT: SetDraft = { tier: 'STANDARD', pool: 'ONLINE', priceEur: '', currency: 'EUR' };

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
 * <p><strong>Nothing is applied optimistically.</strong> The claim guard (#567/#599) refuses a repool
 * or reposition of a set someone is still owed, and the console has no read that predicts it — a
 * pre-warn probe is a standing non-goal (O3 #172). So a refusal must leave the map exactly as the
 * server still has it: the grid re-renders only from the parent's re-read, which {@link changed}
 * asks for. Selection and draft are `linkedSignal`s over {@link sets}, so that re-read re-seeds them
 * instead of stranding an edit whose basis has moved.
 *
 * <p>An in-flight write is guarded by re-reading {@link venueId} rather than by the sibling tabs'
 * epoch counter (#180): this component holds no venue-scoped draft that could outlive a switch — the
 * parent replaces {@link sets}, which resets both linked signals — so the only thing worth dropping
 * is a superseded write's outcome.
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
      return sets.some((s) => s.id === chosen.setId) ? chosen : null;
    },
  });

  /** The selected set's server state, or undefined when nothing is selected. */
  protected readonly selectedSet = computed(() => {
    const chosen = this.selection();
    return chosen === null ? undefined : this.sets().find((s) => s.id === chosen.setId);
  });

  /** The editable draft, re-seeded whenever the selection moves OR the server's copy is re-read. */
  protected readonly draft = linkedSignal<SetDraft>(() => {
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
   * Signal Forms over the draft — the price field binds through it; tier and pool are toggle buttons.
   * The euros string is validated by parsing it on save, the way the sibling operator forms treat their
   * numeric fields, so an empty field reads as "no change" rather than as €0.
   */
  protected readonly draftForm = form(this.draft, (path) => {
    disabled(path.priceEur, { when: () => this.busy() });
  });

  /** The grid extent: the sets' own bounding box, at least one cell so an empty venue still renders. */
  protected readonly rowCount = computed(() => Math.max(1, ...this.sets().map((s) => s.gridY)));
  protected readonly colCount = computed(() => Math.max(1, ...this.sets().map((s) => s.gridX)));

  /** The rendered grid: one entry per position, carrying its set (if any), state and AT label. */
  protected readonly rows = computed(() => {
    const bySlot = new Map(this.sets().map((s) => [slot(s.gridX, s.gridY), s]));
    const selectedId = this.selectedSet()?.id;
    return Array.from({ length: this.rowCount() }, (_, y) => ({
      label: gridRowLabel(y),
      cells: Array.from({ length: this.colCount() }, (_, x) => {
        const set = bySlot.get(slot(x + 1, y + 1));
        const state: CellState = set === undefined ? 'gap' : cellStateOf(set);
        return {
          gridX: x + 1,
          gridY: y + 1,
          setId: set?.id ?? null,
          state,
          selected: set !== undefined && set.id === selectedId,
          label: `Row ${gridRowLabel(y)} position ${x + 1}, ${CELL_STATE_DESC[state]}`,
        };
      }),
    }));
  });

  /** The selected set's identity line — what the guest was told, so it is never silently rewritten. */
  protected readonly selectedLabel = computed(() => {
    const selected = this.selectedSet();
    return selected === undefined ? '' : `Row ${selected.rowLabel} · position ${selected.positionNo}`;
  });

  protected readonly tiers: readonly { key: Tier; label: string }[] = [
    { key: 'PREMIUM', label: 'Front row · premium' },
    { key: 'STANDARD', label: 'Standard' },
  ];

  protected readonly pools: readonly { key: Pool; label: string }[] = [
    { key: 'ONLINE', label: 'Online' },
    { key: 'WALK_IN', label: 'Walk-in' },
  ];

  /** Select the set in a cell; an empty cell is not selectable yet (add lands in a later phase). */
  protected onCell(setId: number | null): void {
    if (setId === null) {
      return;
    }
    this.selection.set({ kind: 'set', setId });
    this.saved.set(false);
    this.errorCode.set(undefined);
    this.confirmRemove.set(false);
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
