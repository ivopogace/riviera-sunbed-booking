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
  remodelPreviewIsCommittable,
} from './operator-console.model';

/**
 * The remodel preview: the `alertdialog` the layout editor opens instead of a save that disturbs a
 * set guests still hold, listing every affected claim in five groups — will move (with the
 * distance), will be refunded, will be released or declined, held by staff for a walk-in, blocks
 * this save — and the sets to keep on the map. A picture free of staff holds and blocks is
 * committable: Save applies the layout, every move and every ending in one server transaction, and
 * each guest is mailed. Any other picture offers Back alone, since the save refuses it. A `stale`
 * picture is the server's fresh answer after a commit found the bookings had changed. A sibling of
 * `shared/confirm-panel.ts` rather than a variant of it, because this panel owns lists; it wears the
 * same amber warn skin.
 *
 * <p><strong>A picture that refunds guests arms Save only once the operator types the refund count
 * and a reason</strong> — the server refuses it otherwise (`409 REFUND_NOT_CONFIRMED`), and both
 * land on the receipt. Its two fields paint in the fixed warn family like everything else here: the
 * ground does not theme, so a themed field skin over it would drift in the dark console.
 *
 * <p><strong>Keep the `@if` outside this component</strong>: it focuses its first control on the way
 * in (WCAG 2.4.3) — the refund-count field when there is one to fill in, else the first button.
 * Focus back out is the caller's, via `focusMover()`. Bookings ride by id and never by code
 * (invariant #7).
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
  /** The commit is in flight — Save is busy, never disabled (RV-FE-9). */
  readonly committing = input(false);
  readonly cancelled = output<void>();
  readonly committed = output<RemodelConfirmation>();

  /** Every claim can be applied: no staff hold, no block. */
  protected readonly committable = computed(() => remodelPreviewIsCommittable(this.preview()));

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

  /** "Save and move 1, refund 1, release 2 bookings" */
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
    const total = preview.moves.length + preview.refunds.length + preview.releases.length;
    return `Save and ${parts.join(', ')} ${total === 1 ? 'booking' : 'bookings'}`;
  }

  /** "Keep Row A · position 3 and Row A · position 2 on the map to save." */
  protected keepSentence(): string {
    const spots = this.preview().keep.map(spotLabel);
    const named =
      spots.length <= 1 ? spots.join('') : `${spots.slice(0, -1).join(', ')} and ${spots.at(-1)}`;
    return `Keep ${named} on the map to save.`;
  }

  protected moveText(move: RemodelMove): string {
    return `${spotLabel(move.from)} → ${spotLabel(move.to)} · ${setDistanceText(move.rowsAway, move.positionsAway)} · ${when(move)}`;
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
    const reason =
      block.reason === 'FROZEN'
        ? 'arrives within the freeze window'
        : 'no free set of the same or better tier that day';
    return `${spotLabel(block.from)} · ${when(block)} · ${reason}`;
  }
}

function spotLabel(spot: RemodelSpot): string {
  return `Row ${spot.rowLabel} · position ${spot.positionNo}`;
}

function when(claim: RemodelClaim): string {
  return `${formatCivilDate(claim.bookingDate)} · ${formatMoney(claim.amount)}`;
}
