import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { catchError, map, Observable, shareReplay, tap, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { todayBookingDate } from '../shared/booking-date';
import { VenueMapView } from '../shared/venue-views';

/**
 * Snapshot reuse window, timed from when the read SETTLES (timed from send, a slow read would
 * expire in flight and a second GET would go out). Long enough to coalesce the console-open
 * burst, short enough that returning to a tab later is a fresh read.
 */
const SNAPSHOT_TTL_MS = 30_000;

/** The owner's read `GET /api/venues/{id}/beach-map`, the member this snapshot keeps (the locks are the layout editor's). */
interface OwnerBeachMap {
  readonly map: VenueMapView;
}

/**
 * The operator console's shared beach-map snapshot: one owner's read (`GET /api/venues/{id}/beach-map`, its
 * `map`; the tourist read hides a PENDING owner's venue, #1531) for {@code venueAccessGuard}, the shell,
 * {@code RequestsTab} and {@code PricingTab} — `core/`, as the guard asks too. Opt-in per call site: {@code DailyViewTab}
 * and {@code LayoutEditor} need server truth. One slot; a changed venue or a Tirane day rollover evicts it. Call
 * {@link reset} on sign-out, after every successful map write (layout, reprice, rename, per-set edits; a walk-in
 * mark/release via {@code AvailabilityChanges#announce}) and BEFORE a `409 STALE_WRITE` recovery read, or tabs go stale.
 */
@Service()
export class ConsoleVenueMap {
  private readonly http = inject(HttpClient);

  private key?: string;
  private snapshot?: Observable<VenueMapView>;
  private expiresAt = 0;
  /** Identifies the current fetch, so a superseded one cannot invalidate the snapshot that replaced it. */
  private generation = 0;

  /**
   * The owner's venue map for today, shared within {@link SNAPSHOT_TTL_MS}: concurrent callers
   * join one in-flight request, later ones replay the settled snapshot. A failed read is never
   * retained, so the caller's error handling runs and the next ask refetches.
   */
  load(venueId: number): Observable<VenueMapView> {
    // The server composes today's overlay, so a snapshot from yesterday is evicted by the key, not the TTL.
    const key = `${venueId}@${todayBookingDate(new Date())}`;
    if (this.key !== key || this.snapshot === undefined || Date.now() >= this.expiresAt) {
      this.key = key;
      // An in-flight read is about to answer, so it never ages out; the window opens when it settles.
      this.expiresAt = Number.POSITIVE_INFINITY;
      this.snapshot = this.fetch(venueId, ++this.generation);
    }
    return this.snapshot;
  }

  /** Drop the snapshot so the next {@link load} refetches — sign-out, and after any map write. */
  reset(): void {
    this.key = undefined;
    this.snapshot = undefined;
    this.expiresAt = 0;
  }

  private fetch(venueId: number, generation: number): Observable<VenueMapView> {
    return this.http
      .get<OwnerBeachMap>(`${environment.apiBaseUrl}/api/venues/${venueId}/beach-map`)
      .pipe(
        map((view) => view.map),
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
