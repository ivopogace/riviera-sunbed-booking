package ai.riviera.platform.booking.application.out;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueId;

/**
 * A booking row loaded by {@link Bookings#findByCode} — the persisted facts the view and cancel use
 * cases (U6) need: identity + lifecycle {@code status}, the {@code (venue, set, date)} ids, the gross
 * {@code amountMinor} paid (integer minor units + ISO currency, invariant #5), and the cancellation
 * audit ({@code cancelledAt} / {@code refundMinor}, both {@code null} until the booking is cancelled).
 * A flat read DTO, not the aggregate.
 */
public record BookingRecord(long id, String code, BookingStatus status, VenueId venueId, SetId setId,
		LocalDate bookingDate, long amountMinor, String currency, Instant cancelledAt,
		Long refundMinor) {
}
