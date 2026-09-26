package ai.riviera.platform.booking.application.view;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The staff daily-bookings read — the inbound port the booking module's operator REST adapter calls
 * to list a venue's settled bookings for one day, each with its set and booking code. Internal to
 * {@code booking}, not cross-module {@code api/} (invariant #11): keeping the read here avoids an
 * {@code availability → booking} cycle (the staff daily view is composed on the frontend from each
 * module's own endpoint).
 */
public interface ListDailyBookings {

	/**
	 * The {@code CONFIRMED}, {@code COMPLETED} and {@code NO_SHOW} bookings on {@code date}
	 * ({@code Europe/Tirane}, #6), ordered by set; empty, never {@code null}. Codes are bearer
	 * credentials (#7): first asserts {@code operator} owns {@code venueId}, else 403 (#13).
	 */
	List<DailyBooking> forVenueOn(OperatorId operator, VenueId venueId, LocalDate date);
}
