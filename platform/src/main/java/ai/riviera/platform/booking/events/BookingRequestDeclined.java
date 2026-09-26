package ai.riviera.platform.booking.events;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * A venue declined a pending Request-to-Book (directly or in a remodel): the guarded
 * {@code PENDING_REQUEST → DECLINED} transition committed, the soft-hold was released, and this is
 * published inside that transaction. Ids + the date only (invariant #11): no {@code venueId}, as
 * {@code notification}, the sole subscriber, re-reads the name; the date as its resolver does not.
 * Not a {@code BookingCancelled}: nothing accrued or was collected. Never the code: the registry
 * stores payloads in cleartext (invariant #7). Withdraw emits none: RESPONSIBILITIES.md §booking.
 */
public record BookingRequestDeclined(BookingId bookingId, SetId setId, LocalDate bookingDate) {
}
