import { inject, Service, Signal } from '@angular/core';
import { filter, Observable, Subject } from 'rxjs';

import { todayBookingDate } from '../shared/booking-date';
import { ConsoleVenueMap } from './console-venue-map';

/** One settled staff write to a venue's `(set, date)` availability — the day it changed, not the set. */
export interface AvailabilityChange {
  readonly venueId: number;
  readonly date: string;
}

/**
 * The carrier between the Daily view's **successful** walk-in mark/release and the console surfaces
 * that count the day (#1525): the console page's shared venue map and the strip's held set. An
 * announce first drops {@link ConsoleVenueMap}'s snapshot (its per-set availability is now stale) and
 * then reaches whoever listens *now* — events, never replayed state, so a surface mounted later does
 * not refetch on a mark that already happened. Intra-feature (page + strip + tab), hence `operator/`.
 */
@Service()
export class AvailabilityChanges {
  private readonly venueMap = inject(ConsoleVenueMap);
  private readonly subject = new Subject<AvailabilityChange>();

  /** Every announced change, for listeners with their own venue/date rule. */
  readonly changes: Observable<AvailabilityChange> = this.subject.asObservable();

  /** Tell the console a staff mark or release for `change` settled on the server. */
  announce(change: AvailabilityChange): void {
    this.venueMap.reset();
    this.subject.next(change);
  }

  /**
   * The changes that move a "today" tile for `venueId`: that venue, dated today in Europe/Tirane as
   * of the moment the change lands (invariant #6) — never today as of mount, the console outlives
   * midnight.
   */
  todayAt(venueId: Signal<number>): Observable<AvailabilityChange> {
    return this.changes.pipe(
      filter((c) => c.venueId === venueId() && c.date === todayBookingDate(new Date())),
    );
  }
}
