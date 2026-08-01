import { inject, Service } from '@angular/core';
import { catchError, Observable, shareReplay, throwError } from 'rxjs';

import { VenueMapView } from '../venue/venue.model';
import { VenueService } from '../venue/venue.service';

/**
 * The operator console's shared `(venue, date)` beach-map snapshot (issue #486). The shell reads the
 * map for its header title and the stats strip's Free-today tile, and two of the tabs rendered inside
 * that shell wanted the byte-identical read — so opening the console on Requests or Pricing fired
 * `GET /api/venues/{id}?date=` **twice**, each transferring every set position and running the
 * server's per-date availability query. This coalesces those asks into one request.
 *
 * <p><strong>Opt-in per call site, deliberately not a transparent cache inside `VenueService`.</strong>
 * Three of the six `getVenueMap` callers want a shared snapshot (this shell, {@code RequestsTab},
 * {@code PricingTab}); the other three want server truth and keep calling {@link VenueService}
 * directly — {@code DailyViewTab} (its post-tap-to-mark reconcile must never render a set the
 * operator just marked as still free), {@code LayoutEditor} (it reloads precisely because it mutated
 * the map), and the tourist beach map (a different feature). A transparent layer would have staled
 * all three silently, and freshness is the harder property to get back.
 *
 * <p><strong>Single slot.</strong> Every consumer asks for the same key within one console session,
 * so one entry is enough — and a changed key (venue switch, midnight date rollover) evicts the
 * previous snapshot outright rather than parking it in a map with an eviction policy to get wrong.
 *
 * <p><strong>Invalidation is the sharp edge.</strong> {@link reset} is called on sign-out and after
 * every successful write to the map — a layout save and a row reprice — or the tabs would render
 * retired sets and stale prices. It is also called *before* the two `409 STALE_WRITE` recovery reads
 * (#226): serving that read from the snapshot whose `setVersion` lost the race would make the
 * conflict unrecoverable.
 *
 * <p>Lives in `operator/` rather than `core/` for the reason {@code PendingRequestsStore} does: both
 * consumers are the same feature (the shell + its tabs), so this is intra-feature shared state, not a
 * cross-cutting singleton (`riviera-frontend`).
 */
@Service()
export class ConsoleVenueMap {
  private readonly venues = inject(VenueService);

  private key?: string;
  private snapshot?: Observable<VenueMapView>;

  /**
   * The venue map for `(venueId, date)`, shared with every other caller asking for the same key.
   * Concurrent callers join one in-flight request; a later caller replays the settled snapshot. A
   * failed read is never retained, so the caller's own error handling still runs and the next ask
   * goes back to the server.
   */
  load(venueId: number, date: string): Observable<VenueMapView> {
    const key = `${venueId}@${date}`;
    if (this.key !== key || this.snapshot === undefined) {
      this.key = key;
      this.snapshot = this.fetch(venueId, date, key);
    }
    return this.snapshot;
  }

  /** Drop the snapshot so the next {@link load} refetches — sign-out, and after any map write. */
  reset(): void {
    this.key = undefined;
    this.snapshot = undefined;
  }

  private fetch(venueId: number, date: string, key: string): Observable<VenueMapView> {
    return this.venues.getVenueMap(venueId, date).pipe(
      catchError((error: unknown) => {
        if (this.key === key) {
          this.reset(); // a failure is not cached, so the caller can retry
        }
        return throwError(() => error);
      }),
      // refCount:false — an early unsubscribe (a tab destroyed mid-flight) must not cancel the
      // request the other consumer is still waiting on.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  }
}
