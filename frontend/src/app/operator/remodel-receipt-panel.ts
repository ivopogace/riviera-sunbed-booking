import { Component, input, output } from '@angular/core';

import { formatCivilDate } from '../shared/booking-date';
import { formatDeadline } from '../shared/deadline';
import { setDistanceText } from '../shared/set-distance';
import { TouchTarget } from '../shared/touch-target';
import { formatMoney } from '../shared/money';
import {
  RemodelReceipt,
  RemodelReceiptClaim,
  RemodelReceiptMove,
  RemodelReceiptRelease,
  RemodelSpot,
} from './operator-console.model';

/**
 * A remodel-commit receipt: when the layout was saved, every booking it moved — each with the spot
 * the guest was told before, the spot they hold now and the distance — and every claim it ended
 * instead, with what was refunded and why. Shown right after a commit and again from the editor's
 * past remodels, so an operator can answer a guest who phones about a changed spot or a refund.
 * Bookings by id, never by code (invariant #7). The `@if` stays outside; focus in and out is the
 * caller's (`focusMover()` on the heading's test id).
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
    @if (receipt().refunds.length > 0) {
      <h4 class="mt-2 text-[12.5px] font-bold">
        Refunded ({{ receipt().refunds.length }}) · {{ refundedTotalText() }}
      </h4>
      <ul
        class="mt-1 list-disc pl-4 text-[12px] leading-[1.45]"
        data-testid="layout-remodel-receipt-refunds"
      >
        @for (refund of receipt().refunds; track refund.bookingId) {
          <li>{{ claimText(refund) }}</li>
        }
      </ul>
      <p
        class="mt-1 text-[12px] leading-[1.45] text-riv-card-ink-soft"
        data-testid="layout-remodel-receipt-reason"
      >
        Reason: {{ receipt().refundReason }}
      </p>
    }
    @if (receipt().releases.length > 0) {
      <h4 class="mt-2 text-[12.5px] font-bold">
        Released or declined ({{ receipt().releases.length }})
      </h4>
      <ul
        class="mt-1 list-disc pl-4 text-[12px] leading-[1.45]"
        data-testid="layout-remodel-receipt-releases"
      >
        @for (release of receipt().releases; track release.bookingId) {
          <li>{{ releaseText(release) }}</li>
        }
      </ul>
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

  /** What the commit returned to guests; only rendered when it refunded at least one. */
  protected refundedTotalText(): string {
    const total = this.receipt().refundedTotal;
    return total === null ? '' : `${formatMoney(total)} returned`;
  }

  protected claimText(claim: RemodelReceiptClaim): string {
    return `${spotLabel(claim.from)} · ${formatCivilDate(claim.bookingDate)} · ${formatMoney(claim.amount)}`;
  }

  protected releaseText(release: RemodelReceiptRelease): string {
    const kind =
      release.kind === 'RELEASE' ? 'unpaid booking released' : 'pending request declined';
    return `${this.claimText(release)} · ${kind}`;
  }

  protected moveText(move: RemodelReceiptMove): string {
    return `${spotLabel(move.from)} → ${spotLabel(move.to)} · ${setDistanceText(move.rowsAway, move.positionsAway)} · ${formatCivilDate(move.bookingDate)}`;
  }
}

function spotLabel(spot: RemodelSpot): string {
  return `Row ${spot.rowLabel} · position ${spot.positionNo}`;
}
