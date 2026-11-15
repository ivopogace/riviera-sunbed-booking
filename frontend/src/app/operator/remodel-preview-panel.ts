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
import { rowName } from '../shared/set-label';
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
 * The layout editor's remodel `alertdialog`, a sibling of `shared/confirm-panel.ts`, not a variant
 * (`RESPONSIBILITIES.md` §Frontend): every claim a save would disturb, grouped as the server
 * answered (moves, refunds, releases, nothing left, staff holds, blocked); a staff hold or `displaced` offers
 * Back alone. Save arms on refunds only once count and reason are typed (else the server answers
 * `409 REFUND_NOT_CONFIRMED`). Fixed warn skin (`riviera-tailwind`). Keep the `@if` outside: it
 * focuses its first control on mount (WCAG 2.4.3); `focusMover()` undoes it. Bookings by id (#7).
 */
@Component({
  selector: 'app-remodel-preview-panel',
  imports: [RouterLink, TouchTarget, BusyAction, FormField, FieldErrorFor],
  host: {
    role: 'alertdialog',
    '[attr.aria-label]': 'dialogLabel',
    'data-testid': 'layout-remodel-preview',
    class:
      'mt-3 block rounded-[12px] border border-riv-warn-edge/60 bg-riv-warn-fill px-3 py-2.5 text-riv-warn-ink',
  },
  templateUrl: './remodel-preview-panel.html',
})
export class RemodelPreviewPanel {
  protected readonly dialogLabel = $localize`:Accessible name of the beach-map remodel confirmation dialog:Confirm remodel`;
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
    required(path.typedCount, {
      message: $localize`Type the number of refunds to confirm them.`,
    });
    validate(path.typedCount, ({ value }) =>
      value() === this.refundCount()
        ? null
        : {
            kind: 'refundCount',
            message: $localize`Type ${this.refundCount()}:count: to confirm the refunds.`,
          },
    );
    required(path.reason, { message: REASON_REQUIRED });
    maxLength(path.reason, 500, {
      message: $localize`Keep the reason under 500 characters.`,
    });
    validate(path.reason, ({ value }) =>
      value().trim().length > 0 ? null : { kind: 'blank', message: REASON_REQUIRED },
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

  /** "Save and move 1, refund 1, release 2, end 1, keep 1 bookings" */
  protected saveLabel(): string {
    if (this.committing()) {
      return $localize`Saving…`;
    }
    const preview = this.preview();
    const parts: string[] = [];
    if (preview.moves.length > 0) {
      parts.push(
        $localize`:Remodel save button list item; count of bookings moved:move ${preview.moves.length}:count:`,
      );
    }
    if (preview.refunds.length > 0) {
      parts.push(
        $localize`:Remodel save button list item; count of bookings refunded:refund ${preview.refunds.length}:count:`,
      );
    }
    if (preview.releases.length > 0) {
      parts.push(
        $localize`:Remodel save button list item; count of bookings released:release ${preview.releases.length}:count:`,
      );
    }
    if (preview.ended.length > 0) {
      parts.push(
        $localize`:Remodel save button list item; count of bookings ended:end ${preview.ended.length}:count:`,
      );
    }
    if (preview.blocks.length > 0) {
      parts.push(
        $localize`:Remodel save button list item; count of bookings kept:keep ${preview.blocks.length}:count:`,
      );
    }
    const total =
      preview.moves.length +
      preview.refunds.length +
      preview.releases.length +
      preview.ended.length +
      preview.blocks.length;
    const actions = parts.join(', ');
    return total === 1
      ? $localize`:Remodel save button; actions is a list like "move 1, refund 2":Save and ${actions}:actions: booking`
      : $localize`:Remodel save button; actions is a list like "move 1, refund 2":Save and ${actions}:actions: bookings`;
  }

  /** "2 bookings can’t be moved or ended yet, so their sets stay on the map exactly as they are." */
  protected keptSentence(): string {
    const blocked = this.preview().blocks.length;
    return blocked === 1
      ? $localize`1 booking can’t be moved or ended yet, so its set stays on the map exactly as it is.`
      : $localize`${blocked}:count: bookings can’t be moved or ended yet, so their sets stay on the map exactly as they are.`;
  }

  /**
   * Committable: "Row A · position 3 stays on the map; the rest …". Displaced: "Keep Row A ·
   * position 3 at its row and position to save." Held: "Keep Row A · position 2 on the map to
   * save." — the held sets alone, since the save keeps a blocked claim's set itself.
   */
  protected keepSentence(): string {
    if (this.committable()) {
      const kept = this.preview().keep.map(spotLabel);
      const spots = nameSpots(kept);
      return kept.length === 1
        ? $localize`${spots}:spot: stays on the map; the rest of the layout is saved as painted.`
        : $localize`${spots}:spots: stay on the map; the rest of the layout is saved as painted.`;
    }
    if (this.displaced()) {
      const kept = this.preview().keep.map(spotLabel);
      const spots = nameSpots(kept);
      return kept.length === 1
        ? $localize`Keep ${spots}:spot: at its row and position to save.`
        : $localize`Keep ${spots}:spots: at their row and position to save.`;
    }
    const held = this.preview().staffHolds.map((hold) => spotLabel(hold.set));
    const spots = nameSpots(held);
    return $localize`Keep ${spots}:spots: on the map to save.`;
  }

  protected moveText(move: RemodelMove): string {
    return `${spotLabel(move.from)} → ${spotLabel(move.to)} · ${setDistanceText(move.rowsAway, move.positionsAway)} · ${when(move)}`;
  }

  /** "You pay €5 per refunded booking — €10 in total, deducted from your payout." */
  protected feeSentence(): string {
    const preview = this.preview();
    const perBooking = preview.refunds[0]?.fee;
    const total = formatMoney(preview.feeTotal);
    if (!perBooking) {
      return $localize`You pay a fee — ${total}:total: in total, deducted from your payout.`;
    }
    const fee = formatMoney(perBooking);
    return $localize`You pay ${fee}:fee: per refunded booking — ${total}:total: in total, deducted from your payout.`;
  }

  protected refundText(claim: RemodelClaim): string {
    const spot = spotLabel(claim.from);
    const detail = when(claim);
    return $localize`:Remodel refund line; detail is the date and amount:${spot}:spot: · ${detail}:detail: refunded in full`;
  }

  protected releaseText(release: RemodelRelease): string {
    return `${spotLabel(release.from)} · ${when(release)} · ${releaseKindText(release.kind)}`;
  }

  /** "Row A · position 3 · Thu 24 Sept · every day already refunded" — no amount: nothing is left. */
  protected endedText(claim: RemodelClaim): string {
    return `${spotLabel(claim.from)} · ${formatCivilDate(claim.bookingDate)} · ${EVERY_DAY_REFUNDED}`;
  }

  protected holdText(hold: RemodelStaffHold): string {
    const dates = hold.dates.map(formatCivilDate).join(', ');
    const held = $localize`:A set staff hold on the listed dates:held by staff ${dates}:dates:`;
    return `${spotLabel(hold.set)} · ${held}`;
  }

  protected blockText(block: RemodelBlock): string {
    return `${spotLabel(block.from)} · ${when(block)} · ${remodelBlockReasonText(block.reason)}`;
  }
}

const REASON_REQUIRED = $localize`Give a reason — it goes on the receipt.`;

const EVERY_DAY_REFUNDED = $localize`:A remodel claim with nothing left to refund:every day already refunded`;

function releaseKindText(kind: RemodelRelease['kind']): string {
  return kind === 'RELEASE'
    ? $localize`unpaid booking released`
    : $localize`pending request declined`;
}

function spotLabel(spot: RemodelSpot): string {
  const row = rowName(spot.rowLabel);
  return $localize`:Beach-map set location; row is like "Row A":${row}:row: · position ${spot.positionNo}:position:`;
}

/** "A, B and C" */
function nameSpots(spots: readonly string[]): string {
  return spots.length <= 1
    ? spots.join('')
    : $localize`:A list of set locations, "A, B and C":${spots.slice(0, -1).join(', ')}:head: and ${spots.at(-1)}:last:`;
}

function when(claim: RemodelClaim): string {
  return `${formatCivilDate(claim.bookingDate)} · ${formatMoney(claim.amount)}`;
}
