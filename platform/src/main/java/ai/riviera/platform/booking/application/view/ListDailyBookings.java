package ai.riviera.platform.booking.application.view;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.venue.api.VenueId;

/**
 * The staff daily-bookings read (U8, issue #10) — the inbound port the booking module's operator
 * REST adapter calls to list a venue's <strong>confirmed</strong> bookings for one day, each with
 * its set and booking code. Internal to {@code booking} ({@code application.in}), not cross-module
 * {@code api/} (invariant #11): the only caller is this module's own REST adapter, and keeping the
 * read here avoids an {@code availability → booking} cycle (the staff daily view is composed on the
 * frontend from each module's own endpoint).
 */
public interface ListDailyBookings {

	/**
	 * The {@code CONFIRMED} bookings for {@code venueId} on {@code date} (a {@code LocalDate} in
	 * {@code Europe/Tirane}, invariant #6), as {@code (setId, code)} rows ordered by set. Excludes
	 * awaiting-payment and cancelled bookings. Empty (never {@code null}) when there are none.
	 *
	 * <p>Booking codes are bearer credentials (invariant #7), so this read is venue-scoped: the
	 * implementation asserts {@code operator} owns {@code venueId} first (invariant #13) and returns
	 * {@code 403} on a mismatch, before any code is read.
	 */
	List<DailyBooking> forVenueOn(OperatorId operator, VenueId venueId, LocalDate date);
}
