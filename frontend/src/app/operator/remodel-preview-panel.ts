import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { form, FormField, maxLength, required, validate } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import { formatCivilDate } from '../shared/booking-date';
import { BusyAction } from '../shared/busy-action';
import { FieldErrorFor } from '../shared/field-error-for';
import { formatMoney } from '../shared/money';
import { setDistanceText } from '../shared/set-distance';
import { TouchTarget } from '../shared/touch-target';
import {
  RemodelBlock,
  RemodelClaim,
  RemodelConfirmation,
  RemodelMove,
  RemodelPreview,
  RemodelRelease,
  RemodelSpot,
  RemodelStaffHold,
  remodelBlockReasonText,
  remodelPreviewIsCommittable,
} from './operator-console.model';

/**
 * The layout editor's remodel `alertdialog`: every claim a save would disturb, in five groups, as
 * the server answered (the commit re-derives it). A staff hold or `displaced` offers Back alone.
 * Save arms on refunds only once count and reason are typed (else `409 REFUND_NOT_CONFIRMED`).
 * Fields keep the fixed warn skin, never a themed one (`riviera-tailwind`: tokenise a skin whole).
 * <strong>Keep the `@if` outside</strong>: it focuses its first control on mount (WCAG 2.4.3); the
 * caller's `focusMover()` moves focus back out. Bookings ride by id, never code (invariant #7).
 */
@Component({
  selector: 'app-remodel-preview-panel',
  imports: [RouterLink, TouchTarget, BusyAction, FormField, FieldErrorFor],
  host: {
    role: 'alertdialog',
    'aria-label': 'Confirm remodel',
    'data-testid': 'layout-remodel-preview',
    class:
      'mt-3 block rounded-[12px] border border-riv-warn-edge/60 bg-riv-warn-fill px-3 py-2.5 text-riv-warn-ink',
  },
  templateUrl: './remodel-preview-panel.html',
})
export class RemodelPreviewPanel {
  readonly preview = input.required<RemodelPreview>();
  /** The venue the bookings link opens the daily view of. */
  readonly venueId = input.required<number>();
  /** The commit found the bookings changed since the preview; this picture is the fresh one. */
  readonly stale = input(false);
  /** The commit is in flight — Save goes busy, never disabled by it (RV-FE-9). */
  readonly committing = input(false);
  /** The commit refused: the painted layout gives a kept set's row and position to another set. */
  readonly displaced = input(false);
  readonly cancelled = output<void>();
  readonly committed = output<RemodelConfirmation>();

  /** Every claim can be settled: no staff hold, and no kept set displaced by the paint. */
  protected readonly committable = computed(
    () => !this.displaced() && remodelPreviewIsCommittable(this.preview()),
  );

  /** How many guests get their money back — the number the operator must type out. */
  protected readonly refundCount = computed(() => this.preview().refunds.length);

  protected readonly confirmModel = signal<{ typedCount: number | null; reason: string }>({
    typedCount: null,
    reason: '',
  });

  protected readonly confirmForm = form(this.confirmModel, (path) => {
    required(path.typedCount, { message: 'Type the number of refunds to confirm them.' });
    validate(path.typedCount, ({ value }) =>
      value() === this.refundCount()
        ? null
        : {
            kind: 'refundCount',
            message: `Type ${this.refundCount()} to confirm the refunds.`,
          },
    );
    required(path.reason, { message: 'Give a reason — it goes on the receipt.' });
    maxLength(path.reason, 500, { message: 'Keep the reason under 500 characters.' });
    validate(path.reason, ({ value }) =>
      value().trim().length > 0
        ? null
        : { kind: 'blank', message: 'Give a reason — it goes on the receipt.' },
    );
  });

  /** Save is armed when nothing is refunded, or when the count and the reason are both in. */
  protected readonly armed = computed(() => this.refundCount() === 0 || this.confirmForm().valid());

  private readonly firstButton = viewChild<ElementRef<HTMLButtonElement>>('firstButton');
  private readonly refundCountField = viewChild<ElementRef<HTMLInputElement>>('refundCountField');

  constructor() {
    afterNextRender({
      write: () => (this.refundCountField() ?? this.firstButton())?.nativeElement.focus(),
    });
  }

  protected confirm(): void {
    if (!this.armed() || this.committing()) {
      return;
    }
    this.committed.emit({
      refundCount: this.refundCount(),
      refundReason: this.confirmModel().reason.trim(),
    });
  }

  /** "Save and move 1, refund 1, release 2, keep 1 bookings" */
  protected saveLabel(): string {
    if (this.committing()) {
      return 'Saving…';
    }
    const preview = this.preview();
    const parts: string[] = [];
    if (preview.moves.length > 0) {
      parts.push(`move ${preview.moves.length}`);
    }
    if (preview.refunds.length > 0) {
      parts.push(`refund ${preview.refunds.length}`);
    }
    if (preview.releases.length > 0) {
      parts.push(`release ${preview.releases.length}`);
    }
    if (preview.blocks.length > 0) {
      parts.push(`keep ${preview.blocks.length}`);
    }
    const total =
      preview.moves.length +
      preview.refunds.length +
      preview.releases.length +
      preview.blocks.length;
    return `Save and ${parts.join(', ')} ${total === 1 ? 'booking' : 'bookings'}`;
  }

  /** "2 bookings can’t be moved or ended yet, so their sets stay on the map exactly as they are." */
  protected keptSentence(): string {
    const blocked = this.preview().blocks.length;
    return blocked === 1
      ? '1 booking can’t be moved or ended yet, so its set stays on the map exactly as it is.'
      : `${blocked} bookings can’t be moved or ended yet, so their sets stay on the map exactly as they are.`;
  }

  /**
   * Committable: "Row A · position 3 stays on the map; the rest …". Displaced: "Keep Row A ·
   * position 3 at its row and position to save." Held: "Keep Row A · position 2 on the map to
   * save." — the held sets alone, since the save keeps a blocked claim's set itself.
   */
  protected keepSentence(): string {
    if (this.committable()) {
      const kept = this.preview().keep.map(spotLabel);
      return `${nameSpots(kept)} ${kept.length === 1 ? 'stays' : 'stay'} on the map; the rest of the layout is saved as painted.`;
    }
    if (this.displaced()) {
      const kept = this.preview().keep.map(spotLabel);
      return `Keep ${nameSpots(kept)} at ${kept.length === 1 ? 'its' : 'their'} row and position to save.`;
    }
    const held = this.preview().staffHolds.map((hold) => spotLabel(hold.set));
    return `Keep ${nameSpots(held)} on the map to save.`;
  }

  protected moveText(move: RemodelMove): string {
    return `${spotLabel(move.from)} → ${spotLabel(move.to)} · ${setDistanceText(move.rowsAway, move.positionsAway)} · ${when(move)}`;
  }

  /** "You pay €5 per refunded booking — €10 in total, deducted from your payout." */
  protected feeSentence(): string {
    const preview = this.preview();
    const perBooking = preview.refunds[0]?.fee;
    const perBookingText = perBooking ? `${formatMoney(perBooking)} per refunded booking` : 'a fee';
    return `You pay ${perBookingText} — ${formatMoney(preview.feeTotal)} in total, deducted from your payout.`;
  }

  protected refundText(claim: RemodelClaim): string {
    return `${spotLabel(claim.from)} · ${when(claim)} refunded in full`;
  }

  protected releaseText(release: RemodelRelease): string {
    const kind =
      release.kind === 'RELEASE' ? 'unpaid booking released' : 'pending request declined';
    return `${spotLabel(release.from)} · ${when(release)} · ${kind}`;
  }

  protected holdText(hold: RemodelStaffHold): string {
    return `${spotLabel(hold.set)} · held by staff ${hold.dates.map(formatCivilDate).join(', ')}`;
  }

  protected blockText(block: RemodelBlock): string {
    return `${spotLabel(block.from)} · ${when(block)} · ${remodelBlockReasonText(block.reason)}`;
  }
}

function spotLabel(spot: RemodelSpot): string {
  return `Row ${spot.rowLabel} · position ${spot.positionNo}`;
}

/** "A, B and C" */
function nameSpots(spots: readonly string[]): string {
  return spots.length <= 1
    ? spots.join('')
    : `${spots.slice(0, -1).join(', ')} and ${spots.at(-1)}`;
}

function when(claim: RemodelClaim): string {
  return `${formatCivilDate(claim.bookingDate)} · ${formatMoney(claim.amount)}`;
}
