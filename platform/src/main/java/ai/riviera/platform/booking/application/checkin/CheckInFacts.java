package ai.riviera.platform.booking.application.checkin;

import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The committed state a losing check-in scan is classified against, read after the guarded {@code
 * UPDATE} matched 0 rows: the booking's status, its first service day, its set and whether today's
 * service day is already attended, was refunded, or was refunded <em>and released</em> (ADR-0027) — what
 * tells a second scan on one service day of a live stay from a scan on a day the stay does not cover, on a
 * day the storm gave back, or on a day the venue freed. For a stay, the stretch nearest today.
 * Venue-scoped by the query, so foreign-venue codes read as absent (non-enumerating, D-8 posture).
 */
public record CheckInFacts(BookingStatus status, LocalDate bookingDate, SetId setId, boolean attendedToday,
		boolean refundedToday, boolean releasedToday) {

	/** Facts for a day no refund touched. */
	public CheckInFacts(BookingStatus status, LocalDate bookingDate, SetId setId, boolean attendedToday) {
		this(status, bookingDate, setId, attendedToday, false, false);
	}
}
