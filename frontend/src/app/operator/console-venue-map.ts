import { inject, Service } from '@angular/core';
import { catchError, Observable, shareReplay, tap, throwError } from 'rxjs';

import { VenueMapView } from '../shared/venue-views';
import { VenueService } from '../venue/venue.service';

/**
 * Snapshot reuse window, timed from when the read SETTLES (timed from send, a slow read would
 * expire in flight and a second GET would go out). Long enough to coalesce the console-open
 * burst, short enough that returning to a tab later is a fresh read.
 */
const SNAPSHOT_TTL_MS = 30_000;

/**
 * The operator console's shared `(venue, date)` beach-map snapshot: one request for the shell's,
 * console page's, {@code RequestsTab}'s and {@code PricingTab}'s identical venue-map read. Opt-in
 * per call site, never inside {@link VenueService}: {@code DailyViewTab}, {@code LayoutEditor} and
 * the tourist map need server truth. One slot; a changed key evicts it. Call {@link reset} on
 * sign-out, after every successful map write (layout, reprice, rename, per-set add/edit/move/remove)
 * and BEFORE a `409 STALE_WRITE` recovery read, or tabs render stale sets and the conflict sticks.
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
   * The venue map for `(venueId, date)`, shared within {@link SNAPSHOT_TTL_MS}: concurrent callers
   * join one in-flight request, later ones replay the settled snapshot. A failed read is never
   * retained, so the caller's error handling runs and the next ask refetches.
   */
  load(venueId: number, date: string): Observable<VenueMapView> {
    const key = `${venueId}@${date}`;
    if (this.key !== key || this.snapshot === undefined || Date.now() >= this.expiresAt) {
      this.key = key;
      // An in-flight read is about to answer, so it never ages out; the window opens when it settles.
      this.expiresAt = Number.POSITIVE_INFINITY;
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
      tap(() => {
        if (this.generation === generation) {
          this.expiresAt = Date.now() + SNAPSHOT_TTL_MS;
        }
      }),
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
