import { inject, Service } from '@angular/core';
import { catchError, Observable, shareReplay, throwError } from 'rxjs';

import { VenueMapView } from '../venue/venue.model';
import { VenueService } from '../venue/venue.service';

/**
 * How long a snapshot may be reused. Long enough to coalesce the console-open burst — the shell and
 * its lazily-routed tab mount milliseconds apart — and short enough that returning to a tab later is
 * the fresh read it was before this cache existed (a tab is destroyed and recreated on every
 * navigation, so its activation was the only refresh Pricing and Requests ever had).
 */
const SNAPSHOT_TTL_MS = 30_000;

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
 * operator just marked as still free), {@code LayoutEditor} (it seeds its grid from the server and
 * re-reads to escape a write conflict), and the tourist beach map (a different feature). A
 * transparent layer would have staled all three silently, and freshness is the harder property to
 * get back.
 *
 * <p><strong>Bounded, single slot.</strong> Every consumer asks for the same key within one console
 * session, so one entry is enough — and a changed key (venue switch, midnight date rollover) evicts
 * the previous snapshot outright rather than parking it in a map with an eviction policy to get
 * wrong. {@link SNAPSHOT_TTL_MS} bounds how long that entry survives, so this stays a coalescing
 * window rather than a session-lifetime cache that would hide another device's edits until the next
 * write.
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
  private expiresAt = 0;
  /** Identifies the current fetch, so a superseded one cannot invalidate the snapshot that replaced it. */
  private generation = 0;

  /**
   * The venue map for `(venueId, date)`, shared with every other caller asking for the same key
   * within {@link SNAPSHOT_TTL_MS}. Concurrent callers join one in-flight request; a later caller
   * replays the settled snapshot. A failed read is never retained, so the caller's own error handling
   * still runs and the next ask goes back to the server.
   */
  load(venueId: number, date: string): Observable<VenueMapView> {
    const key = `${venueId}@${date}`;
    if (this.key !== key || this.snapshot === undefined || Date.now() >= this.expiresAt) {
      this.key = key;
      this.expiresAt = Date.now() + SNAPSHOT_TTL_MS;
      this.snapshot = this.fetch(venueId, date, ++this.generation);
    }
    return this.snapshot;
  }

  /** Drop the snapshot so the next {@link load} refetches — sign-out, and after any map write. */
  reset(): void {
    this.key = undefined;
    this.snapshot = undefined;
    this.expiresAt = 0;
  }

  private fetch(venueId: number, date: string, generation: number): Observable<VenueMapView> {
    return this.venues.getVenueMap(venueId, date).pipe(
      catchError((error: unknown) => {
        // Identity, not key: the key recurs after a reset, so a value check drops the replacement.
        if (this.generation === generation) {
          this.reset();
        }
        return throwError(() => error);
      }),
      // refCount:false — an unsubscribing tab must not cancel the request another consumer awaits.
      shareReplay({ bufferSize: 1, refCount: false }),
    );
  }
}
