import { Component, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { Observable } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { todayBookingDate } from '../shared/booking-date';
import { venueIdParam } from '../shared/parent-venue-id';
import { VenueMapView } from '../shared/venue-views';
import { AvailabilityChanges } from './availability-changes';
import { ConsoleStatsStrip } from './console-stats-strip';
import { ConsoleVenueMap } from './console-venue-map';
import { OperatorConsoleService } from './operator-console.service';
import { PendingApprovalBanner } from './pending-approval-banner';
import { PendingRequestsStore } from './pending-requests-store';

/**
 * The venue console's page at `/operator/:venueId`: the stats strip, the pending-approval banner
 * and the tab outlet hosting each tab as a child route. Its chrome is `console-shell.ts`'s; this
 * component publishes nothing to it and owns only the per-venue seeding: the shared venue-map
 * snapshot (one request for strip and shell; re-read when the Daily view settles a walk-in,
 * {@link AvailabilityChanges}) and the Requests badge count (`PendingRequestsStore`). No sign-in
 * gate: {@code operatorSessionGuard} awaits the restore, so this only renders signed-in.
 */
@Component({
  selector: 'app-operator-console',
  imports: [RouterOutlet, ConsoleStatsStrip, PendingApprovalBanner],
  templateUrl: './operator-console.html',
  host: { class: 'block' },
})
export class OperatorConsole {
  private readonly route = inject(ActivatedRoute);
  private readonly venueMap = inject(ConsoleVenueMap);
  private readonly console = inject(OperatorConsoleService);
  private readonly requests = inject(PendingRequestsStore);
  private readonly changes = inject(AvailabilityChanges);
  private readonly operator = inject(OperatorAuth);

  /** The venue this console manages — reactive to in-place `:venueId` changes: the router
   *  reuses this instance when only the param differs, so a snapshot read would pin the old venue. */
  protected readonly venueId = venueIdParam(this.route);

  /** The venue map loaded per venue for the stats strip's free/total tile. */
  protected readonly venue = signal<VenueMapView | undefined>(undefined);
  /** Bumped per venue context: an identity guard — a venueId value check passes again
   *  after an A→B→A switch, so continuations compare this instead. */
  private epoch = 0;

  constructor() {
    // Load per session (the async /me restore resolves late) AND per venue param.
    effect(() => {
      const id = this.venueId();
      if (this.operator.signedIn()) {
        untracked(() => this.load(id));
      }
    });
    // A settled walk-in moved today's availability: re-read the map only — the Requests tab may own the badge.
    this.changes
      .todayAt(this.venueId)
      .pipe(takeUntilDestroyed())
      .subscribe((change) => this.loadMap(change.venueId, change.date, this.epoch));
  }

  /**
   * Load the strip's venue map + the Requests badge count. Both are best-effort: a failed read
   * leaves the strip's fallback / no badge and never blocks the page.
   */
  private load(venueId: number): void {
    const epoch = ++this.epoch;
    // A venue switch reuses this instance — drop the old map while the new one loads.
    this.venue.set(undefined);
    // Fresh load starts the badge at 0, so a slow/failed seed never shows a stale count — nor
    // one leaked from a previously-managed venue (the store is a root singleton). The Requests tab, once
    // visited, takes authority over this store via `set`; this page only ever seeds it.
    this.requests.reset();
    // Continuations re-check the venue so a superseded venue's reads never land here.
    this.loadMap(venueId, todayBookingDate(new Date()), epoch);
    this.bestEffort(this.console.pendingRequestCount(venueId), (count) => {
      if (this.epoch === epoch) {
        this.requests.seed(count);
      }
    });
  }

  /** The shared map read behind the strip's free/total; the current map stands until it lands, and
   *  only while `epoch` is still the venue context it was sent for. */
  private loadMap(venueId: number, date: string, epoch: number): void {
    this.bestEffort(this.venueMap.load(venueId, date), (venue) => {
      if (this.epoch === epoch) {
        this.venue.set(venue);
      }
    });
  }

  /** Subscribe to a best-effort read: apply the value, or silently ignore a failure. */
  private bestEffort<T>(source: Observable<T>, apply: (value: T) => void): void {
    source.subscribe({
      next: apply,
      error: () => {
        // best-effort — the page still works with the strip's fallback / no badge
      },
    });
  }
}
