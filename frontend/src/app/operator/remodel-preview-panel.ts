import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import { formatCivilDate } from '../shared/booking-date';
import { formatMoney } from '../shared/money';
import { TouchTarget } from '../shared/touch-target';
import {
  RemodelBlock,
  RemodelClaim,
  RemodelMove,
  RemodelPreview,
  RemodelRelease,
  RemodelSpot,
  RemodelStaffHold,
} from './operator-console.model';

/**
 * The remodel preview: the `alertdialog` the layout editor opens instead of a save that drops a
 * set guests still hold, listing every affected claim in five groups — will move (with the
 * distance), will be refunded, will be released or declined, held by staff for a walk-in, blocks
 * this save — and the sets to keep on the map. Informational: the save is refused while any listed
 * claim is live, so the one action is Back; the commit that applies the groups is a later slice's.
 * A sibling of `shared/confirm-panel.ts` rather than a variant of it, because this panel owns lists;
 * it wears the same amber warn skin.
 *
 * <p><strong>Keep the `@if` outside this component</strong>: it focuses its button on the way in
 * (WCAG 2.4.3); focus back out is the caller's, via `focusMover()`. Bookings ride by id and never by
 * code (invariant #7).
 */
@Component({
  selector: 'app-remodel-preview-panel',
  imports: [RouterLink, TouchTarget],
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
  readonly cancelled = output<void>();

  private readonly firstButton = viewChild.required<ElementRef<HTMLButtonElement>>('firstButton');

  constructor() {
    afterNextRender({ write: () => this.firstButton().nativeElement.focus() });
  }

  /** "Keep Row A · position 3 and Row A · position 2 on the map to save." */
  protected keepSentence(): string {
    const spots = this.preview().keep.map(spotLabel);
    const named =
      spots.length <= 1 ? spots.join('') : `${spots.slice(0, -1).join(', ')} and ${spots.at(-1)}`;
    return `Keep ${named} on the map to save.`;
  }

  protected moveText(move: RemodelMove): string {
    return `${spotLabel(move.from)} → ${spotLabel(move.to)} · ${distanceText(move)} · ${when(move)}`;
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

/** "4 positions along the row", "1 row over", "1 row over, 2 positions along". */
function distanceText(move: RemodelMove): string {
  const positions = `${move.positionsAway} position${move.positionsAway === 1 ? '' : 's'}`;
  if (move.rowsAway === 0) {
    return `${positions} along the row`;
  }
  const rows = `${move.rowsAway} row${move.rowsAway === 1 ? '' : 's'} over`;
  return move.positionsAway === 0 ? rows : `${rows}, ${positions} along`;
}
