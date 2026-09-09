package ai.riviera.platform.booking.application.remodel;

import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * A booking a guest may still turn up on, read off a disturbed set for the remodel classification:
 * its id, set, service date, status (live by construction) and snapshotted amount (invariant #5).
 * Module-internal; the published shape is {@code booking.vocabulary.RemodelClaim}.
 */
public record LiveClaim(long bookingId, SetId setId, LocalDate bookingDate, BookingStatus status,
		long amountMinor, String currency) {
}
