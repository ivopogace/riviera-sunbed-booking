import { Component, input, output } from '@angular/core';

import { formatCivilDate } from '../shared/booking-date';
import { formatDeadline } from '../shared/deadline';
import { rowName } from '../shared/set-label';
import { setDistanceText } from '../shared/set-distance';
import { TouchTarget } from '../shared/touch-target';
import { formatMoney } from '../shared/money';
import {
  remodelBlockReasonText,
  RemodelReceipt,
  RemodelReceiptClaim,
  RemodelReceiptEnded,
  RemodelReceiptKept,
  RemodelReceiptMove,
  RemodelReceiptRelease,
  RemodelSpot,
} from './operator-console.model';

/**
 * A remodel-commit receipt: when the layout was saved, every booking it moved — each with the spot
 * the guest was told before, the spot they hold now and the distance — every claim it ended
 * instead, with what was refunded and why (or that nothing was left), every claim it kept, with why its set
 * stayed. Shown after a commit and from the editor's past remodels, to answer a phoning guest.
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
      i18n
    >
      Remodel saved · receipt #{{
        receipt().receiptId // i18n(ph="receiptId")
      }}
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
      <p class="mt-1.5 text-[12px] leading-[1.45]" data-testid="layout-remodel-receipt-moves" i18n>
        No booking was moved.
      </p>
    }
    @if (receipt().refunds.length > 0) {
      <h4 class="mt-2 text-[12.5px] font-bold" i18n>
        Refunded ({{
          receipt().refunds.length  // i18n(ph="count")
        }}) ·
        {{
          refundedTotalText() // i18n(ph="returned")
        }}
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
        data-testid="layout-remodel-receipt-fee"
      >
        {{ feeText() }}
      </p>
      <p
        class="mt-1 text-[12px] leading-[1.45] text-riv-card-ink-soft"
        data-testid="layout-remodel-receipt-reason"
        i18n="Label before the operator's typed remodel reason"
      >
        Reason:
        {{
          receipt().refundReason // i18n(ph="reason")
        }}
      </p>
    }
    @if (receipt().releases.length > 0) {
      <h4 class="mt-2 text-[12.5px] font-bold" i18n>
        Released or declined ({{
          receipt().releases.length  // i18n(ph="count")
        }})
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
    @if (receipt().ended.length > 0) {
      <h4 class="mt-2 text-[12.5px] font-bold" i18n>
        Ended — nothing left to refund ({{
          receipt().ended.length  // i18n(ph="count")
        }})
      </h4>
      <ul
        class="mt-1 list-disc pl-4 text-[12px] leading-[1.45]"
        data-testid="layout-remodel-receipt-ended"
      >
        @for (ended of receipt().ended; track ended.bookingId) {
          <li>{{ endedText(ended) }}</li>
        }
      </ul>
    }
    @if (receipt().kept.length > 0) {
      <h4 class="mt-2 text-[12.5px] font-bold" i18n>
        Kept in place ({{
          receipt().kept.length  // i18n(ph="count")
        }})
      </h4>
      <ul
        class="mt-1 list-disc pl-4 text-[12px] leading-[1.45]"
        data-testid="layout-remodel-receipt-kept"
      >
        @for (kept of receipt().kept; track kept.bookingId) {
          <li>{{ keptText(kept) }}</li>
        }
      </ul>
    }
    <button
      appTouchTarget
      type="button"
      class="mt-2 rounded-[10px] border border-riv-card-border bg-riv-console-inset/45 px-4 py-1.5 text-[12.5px] font-semibold text-riv-card-ink"
      data-testid="layout-remodel-receipt-close"
      (click)="closed.emit()"
      i18n="Closes the remodel receipt"
    >
      Done
    </button>
  `,
})
export class RemodelReceiptPanel {
  readonly receipt = input.required<RemodelReceipt>();
  readonly closed = output<void>();

  /** "Saved Tue 9 Sept, 15:00 · 2 bookings moved, 1 refunded, 2 ended, 1 ended with nothing left, 1 kept in place" */
  protected committedText(): string {
    const receipt = this.receipt();
    const moved = receipt.moves.length;
    const parts = [
      moved === 1
        ? $localize`:Remodel receipt summary list item:1 booking moved`
        : $localize`:Remodel receipt summary list item:${moved}:count: bookings moved`,
    ];
    if (receipt.refunds.length > 0) {
      parts.push(
        $localize`:Remodel receipt summary list item:${receipt.refunds.length}:count: refunded`,
      );
    }
    if (receipt.releases.length > 0) {
      parts.push(
        $localize`:Remodel receipt summary list item:${receipt.releases.length}:count: ended`,
      );
    }
    if (receipt.ended.length > 0) {
      parts.push(
        $localize`:Remodel receipt summary list item:${receipt.ended.length}:count: ended with nothing left`,
      );
    }
    if (receipt.kept.length > 0) {
      parts.push(
        $localize`:Remodel receipt summary list item:${receipt.kept.length}:count: kept in place`,
      );
    }
    const at = formatDeadline(receipt.committedAt);
    const summary = parts.join(', ');
    return $localize`:Remodel receipt line; summary lists what the save did:Saved ${at}:at: · ${summary}:summary:`;
  }

  /** What the commit returned to guests; only rendered when it refunded at least one. */
  protected refundedTotalText(): string {
    const total = this.receipt().refundedTotal;
    if (total === null) {
      return '';
    }
    const amount = formatMoney(total);
    return $localize`:Money returned to guests by a remodel:${amount}:amount: returned`;
  }

  /** "Venue-change fee: €5 per refunded booking, €5 in total" — the rate charged then, not today's. */
  protected feeText(): string {
    const receipt = this.receipt();
    const total = receipt.feeTotal;
    if (total === null) {
      return '';
    }
    const perBooking = receipt.refunds[0]?.fee;
    const totalText = formatMoney(total);
    if (!perBooking) {
      return $localize`Venue-change fee: ${totalText}:total: in total`;
    }
    const fee = formatMoney(perBooking);
    return $localize`Venue-change fee: ${fee}:fee: per refunded booking, ${totalText}:total: in total`;
  }

  protected claimText(claim: RemodelReceiptClaim): string {
    return `${spotLabel(claim.from)} · ${formatCivilDate(claim.bookingDate)} · ${formatMoney(claim.amount)}`;
  }

  protected releaseText(release: RemodelReceiptRelease): string {
    return `${this.claimText(release)} · ${releaseKindText(release.kind)}`;
  }

  protected endedText(ended: RemodelReceiptEnded): string {
    return `${spotLabel(ended.from)} · ${formatCivilDate(ended.bookingDate)} · ${EVERY_DAY_REFUNDED}`;
  }

  protected keptText(kept: RemodelReceiptKept): string {
    return `${spotLabel(kept.from)} · ${formatCivilDate(kept.bookingDate)} · ${remodelBlockReasonText(kept.reason)}`;
  }

  protected moveText(move: RemodelReceiptMove): string {
    return `${spotLabel(move.from)} → ${spotLabel(move.to)} · ${setDistanceText(move.rowsAway, move.positionsAway)} · ${formatCivilDate(move.bookingDate)}`;
  }
}

const EVERY_DAY_REFUNDED = $localize`:A remodel claim with nothing left to refund:every day already refunded`;

function releaseKindText(kind: RemodelReceiptRelease['kind']): string {
  return kind === 'RELEASE'
    ? $localize`unpaid booking released`
    : $localize`pending request declined`;
}

function spotLabel(spot: RemodelSpot): string {
  const row = rowName(spot.rowLabel);
  return $localize`:Beach-map set location; row is like "Row A":${row}:row: · position ${spot.positionNo}:position:`;
}
