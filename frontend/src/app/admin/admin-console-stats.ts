import { Component, computed, inject, input, OnInit, signal } from '@angular/core';

import { formatCommissionPercent } from '../shared/commission-rate';
import { StatTile } from '../shared/stat-tile';
import { AdminCommissionsService } from './admin-commissions.service';
import { VenueCommissionView } from './admin.model';

/**
 * The admin console home's four-tile stat strip, built from existing ADMIN reads (no new endpoint).
 * Renders on `/admin` only and below the tabs, so the pills never shift between tabs; it moves into
 * a shell layout if one lands. The Venues caption is the UNWEIGHTED mean of venue rates, not the
 * platform's take (the note says so), rounded to whole bps via {@link formatCommissionPercent}.
 * `undefined` renders "—", never 0, and a failed read dashes only its own tile. Tiles are inert (no
 * links); labels stay short to avoid wrapping at 360px — `e2e/admin-console-stats.e2e.ts` holds it.
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
          class="mt-2 text-[11.5px] leading-[1.45] text-riv-ink-soft"
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
