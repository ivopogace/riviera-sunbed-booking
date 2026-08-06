import { Component, computed, inject, input, OnInit, signal } from '@angular/core';

import { formatCommissionPercent } from '../shared/commission-rate';
import { StatTile } from '../shared/stat-tile';
import { AdminCommissionsService } from './admin-commissions.service';
import { VenueCommissionView } from './admin.model';

/**
 * The platform-admin console's stat strip (A9, epic #348) — the four tiles the console shell A1/A2
 * never got: the approval queue's depth, how many operators can sign in, how many are suspended, and
 * how many venues the platform carries. Every number comes from an ADMIN read that already ships;
 * A9 adds no endpoint.
 *
 * <p><strong>Where it renders, and why not everywhere.</strong> The design canvas draws the stats
 * once, above the tab strip, on every screen — because the canvas is a single demo page. Here the
 * console is seven independent lazy routes with no layout component, a shape Q1 (PR #524) chose
 * deliberately and gave one revisit trigger: a <em>ninth</em> tab. So this strip renders on the
 * console <em>home</em> only, and <em>below</em> the tabs. Below, because with the strip on one page
 * only, putting it above would shift the pills down on `/admin` and back up on every other tab — the
 * control you just clicked would move. The day a layout component lands on Q1's trigger, this strip
 * moves into it and becomes shell-wide for free; until then, seven copies each re-reading three
 * endpoints per navigation is the wrong trade.
 *
 * <p><strong>The mean rate is not the platform's take rate, and says so.</strong> Nothing on the wire
 * supports a booking-weighted average — the ledger's commission is per booking at accrual (invariant
 * #9), and no read exposes that per venue. What this renders is the unweighted mean of the venue
 * rates, which is a genuine <em>configuration</em> readout (spot an outlier; the Commissions tab is
 * one click above). An admin would nonetheless read a bare "avg commission" as the platform's
 * effective take, so the caption names the aggregation and the note under the strip states the limit
 * outright. The arithmetic is a rate, not money, so invariant #5 is not engaged — but the mean is
 * still rounded to whole basis points, the storage grain, and rendered through the one existing
 * {@link formatCommissionPercent}, never a second percent formatter.
 *
 * <p><strong>Dash and zero are different facts.</strong> The three operator counts arrive as inputs
 * from the page that already reads them (no duplicate fetch), left `undefined` until a read has
 * actually succeeded; the venue read is this strip's own and starts `undefined`. All four render "—"
 * in that state, so a failed read is never dressed up as a confident zero — and a failure in one
 * read dashes only its own tile, never the others (the operator strip's posture, #171).
 *
 * <p>The strip is deliberately inert: no tile links anywhere. The tabs sit directly above it, and a
 * navigating tile would add exactly the focus-management surface that cost A8's review three
 * findings.
 *
 * <p><strong>The labels are terse because the fold is measured, not guessed.</strong> At 360px a tile
 * is ~136px of inner width, so an uppercase 11px label past roughly sixteen characters wraps — and a
 * wrap costs its whole two-tile row a line. Measured: restoring "Pending approvals" and "Active
 * operators" moves the first content heading from y=691 to y=707 against a 740px fold, spending 16
 * of the 22px of headroom that remain. `e2e/admin-console-stats.e2e.ts` holds that budget.
 */
@Component({
  selector: 'app-admin-console-stats',
  imports: [StatTile],
  template: `
    <section class="mt-5" aria-label="Platform at a glance" data-testid="admin-stats">
      <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <app-stat-tile label="To approve" valueTestId="admin-stat-pending">
          {{ pendingCount() ?? '—' }}
        </app-stat-tile>

        <app-stat-tile label="Active" valueTestId="admin-stat-active">
          {{ activeCount() ?? '—' }}
        </app-stat-tile>

        <app-stat-tile label="Suspended" valueTestId="admin-stat-suspended">
          {{ suspendedCount() ?? '—' }}
        </app-stat-tile>

        <app-stat-tile
          label="Venues"
          valueTestId="admin-stat-venues"
          [sub]="meanRateCaption()"
          subTestId="admin-stat-mean-rate"
        >
          {{ venueCount() ?? '—' }}
        </app-stat-tile>
      </div>

      @if (meanRateCaption()) {
        <p
          class="mt-2 text-[11.5px] leading-[1.45] text-(--riv-ink-soft)"
          data-testid="admin-stats-mean-note"
        >
          The mean averages venue rates equally — what the platform takes depends on where bookings
          land.
        </p>
      }
    </section>
  `,
})
export class AdminConsoleStats implements OnInit {
  private readonly commissions = inject(AdminCommissionsService);

  /** Operators awaiting approval, or `undefined` while the page's read is unsettled or failed. */
  readonly pendingCount = input<number | undefined>(undefined);
  /** Operators that can currently sign in, same undefined-is-unknown contract. */
  readonly activeCount = input<number | undefined>(undefined);
  /** Operators blocked from signing in, same undefined-is-unknown contract. */
  readonly suspendedCount = input<number | undefined>(undefined);

  /** Every venue with its rate, or `undefined` until this strip's own read resolves. */
  private readonly venues = signal<readonly VenueCommissionView[] | undefined>(undefined);

  protected readonly venueCount = computed(() => this.venues()?.length);

  /**
   * The Venues tile's sub-caption, or `undefined` when there is no mean to state — an unresolved or
   * failed read, and equally a platform with no venues, where an average of nothing would be a
   * fabricated 0%.
   */
  protected readonly meanRateCaption = computed(() => {
    const venues = this.venues();
    if (venues === undefined || venues.length === 0) {
      return undefined;
    }
    const totalBps = venues.reduce((sum, venue) => sum + venue.commissionBps, 0);
    return `mean rate ${formatCommissionPercent(Math.round(totalBps / venues.length))}`;
  });

  // Not the constructor: an async call there is a testability/ordering smell (typescript:S7059).
  ngOnInit(): void {
    void this.loadVenues();
  }

  private async loadVenues(): Promise<void> {
    try {
      this.venues.set(await this.commissions.venues());
    } catch {
      // best-effort — the Venues tile keeps its dash and the operator tiles are untouched
    }
  }
}
