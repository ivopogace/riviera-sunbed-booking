import { Component, input, output } from '@angular/core';

import { formatCivilDate } from '../shared/booking-date';
import { formatDeadline } from '../shared/deadline';
import { TouchTarget } from '../shared/touch-target';
import { RemodelReceipt, RemodelReceiptMove, RemodelSpot } from './operator-console.model';

/**
 * A remodel-commit receipt: when the layout was saved and every booking it moved, each with the spot
 * the guest was told before, the spot they hold now and the distance. Shown right after a commit and
 * again from the editor's past remodels, so an operator can answer a guest who phones about a
 * changed spot. Bookings by id, never by code (invariant #7). The `@if` stays outside; focus in and
 * out is the caller's (`focusMover()` on the heading's test id).
 */
@Component({
  selector: 'app-remodel-receipt-panel',
  imports: [TouchTarget],
  host: {
    role: 'region',
    'aria-labelledby': 'layout-remodel-receipt-title',
    'data-testid': 'layout-remodel-receipt',
    class:
      'mt-3 block rounded-[12px] border border-riv-card-border bg-riv-console-inset/45 px-3 py-2.5 text-riv-card-ink',
  },
  template: `
    <h3
      id="layout-remodel-receipt-title"
      class="text-[13px] font-bold"
      tabindex="-1"
      data-testid="layout-remodel-receipt-title"
    >
      Remodel saved · receipt #{{ receipt().receiptId }}
    </h3>
    <p class="mt-0.5 text-[12px] leading-[1.45] text-riv-card-ink-soft">
      {{ committedText() }}
    </p>
    @if (receipt().moves.length > 0) {
      <ul
        class="mt-1.5 list-disc pl-4 text-[12px] leading-[1.45]"
        data-testid="layout-remodel-receipt-moves"
      >
        @for (move of receipt().moves; track move.bookingId) {
          <li>{{ moveText(move) }}</li>
        }
      </ul>
    } @else {
      <p class="mt-1.5 text-[12px] leading-[1.45]" data-testid="layout-remodel-receipt-moves">
        No booking was moved.
      </p>
    }
    <button
      appTouchTarget
      type="button"
      class="mt-2 rounded-[10px] border border-riv-card-border bg-riv-console-inset/45 px-4 py-1.5 text-[12.5px] font-semibold text-riv-card-ink"
      data-testid="layout-remodel-receipt-close"
      (click)="closed.emit()"
    >
      Done
    </button>
  `,
})
export class RemodelReceiptPanel {
  readonly receipt = input.required<RemodelReceipt>();
  readonly closed = output<void>();

  /** "Saved Tue 9 Sept, 15:00 · 2 bookings moved" */
  protected committedText(): string {
    const count = this.receipt().moves.length;
    return `Saved ${formatDeadline(this.receipt().committedAt)} · ${count} booking${count === 1 ? '' : 's'} moved`;
  }

  protected moveText(move: RemodelReceiptMove): string {
    return `${spotLabel(move.from)} → ${spotLabel(move.to)} · ${distanceText(move)} · ${formatCivilDate(move.bookingDate)}`;
  }
}

function spotLabel(spot: RemodelSpot): string {
  return `Row ${spot.rowLabel} · position ${spot.positionNo}`;
}

/** "4 positions along the row", "1 row over", "1 row over, 2 positions along" — the preview's words. */
function distanceText(move: RemodelReceiptMove): string {
  const positions = `${move.positionsAway} position${move.positionsAway === 1 ? '' : 's'}`;
  if (move.rowsAway === 0) {
    return `${positions} along the row`;
  }
  const rows = `${move.rowsAway} row${move.rowsAway === 1 ? '' : 's'} over`;
  return move.positionsAway === 0 ? rows : `${rows}, ${positions} along`;
}
