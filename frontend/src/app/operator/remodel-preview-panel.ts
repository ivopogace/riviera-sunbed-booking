import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { formatCivilDate } from '../shared/booking-date';
import { BusyAction } from '../shared/busy-action';
import { formatMoney } from '../shared/money';
import { setDistanceText } from '../shared/set-distance';
import { TouchTarget } from '../shared/touch-target';
import {
  RemodelBlock,
  RemodelClaim,
  RemodelMove,
  RemodelPreview,
  RemodelRelease,
  RemodelSpot,
  RemodelStaffHold,
  remodelPreviewIsCommittable,
} from './operator-console.model';

/**
 * The remodel preview: the `alertdialog` the layout editor opens instead of a save that drops a
 * set guests still hold, listing every affected claim in five groups — will move (with the
 * distance), will be refunded, will be released or declined, held by staff for a walk-in, blocks
 * this save — and the sets to keep on the map. A picture that is moves and nothing else is
 * committable: Save and move applies the layout and every move in one server transaction, each
 * guest is mailed the new spot with a full-refund exit; any other picture offers Back alone, since
 * the save refuses it. A `stale` picture is the server's fresh answer after a commit found the
 * bookings had changed. A sibling of `shared/confirm-panel.ts` rather than a variant of it, because
 * this panel owns lists; it wears the same amber warn skin.
 *
 * <p><strong>Keep the `@if` outside this component</strong>: it focuses its first button on the way
 * in (WCAG 2.4.3); focus back out is the caller's, via `focusMover()`. Bookings ride by id and
 * never by code (invariant #7).
 */
@Component({
  selector: 'app-remodel-preview-panel',
  imports: [RouterLink, TouchTarget, BusyAction],
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
  readonly committed = output<void>();

  /** Moves and nothing else: the one picture the commit applies. */
  protected readonly committable = computed(() => remodelPreviewIsCommittable(this.preview()));

  private readonly firstButton = viewChild.required<ElementRef<HTMLButtonElement>>('firstButton');

  constructor() {
    afterNextRender({ write: () => this.firstButton().nativeElement.focus() });
  }

  /** "Save and move 2 bookings" */
  protected saveLabel(): string {
    if (this.committing()) {
      return 'Saving…';
    }
    const count = this.preview().moves.length;
    const noun = count === 1 ? 'booking' : 'bookings';
    return `Save and move ${count} ${noun}`;
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
