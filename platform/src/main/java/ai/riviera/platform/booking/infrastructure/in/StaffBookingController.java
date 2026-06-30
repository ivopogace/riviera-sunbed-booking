package ai.riviera.platform.booking.infrastructure.in;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.booking.application.in.ListDailyBookings;
import ai.riviera.platform.venue.api.VenueId;

/**
 * Operator read endpoint for the staff daily view (U8, issue #10): a venue's confirmed bookings for
 * one day, each with its set and booking code. Driving adapter depending only on the booking
 * module's {@link ListDailyBookings} port (invariant #11).
 *
 * <p><strong>Operator-gated</strong> — booking codes are bearer credentials (invariant #7), so this
 * read must never be public. {@code SecurityConfig} matches the staff-bookings GET to role
 * {@code OPERATOR} <em>before</em> the public venue GET rule; an unauthenticated call is
 * {@code 401}. {@code date} defaults to today in {@code Europe/Tirane} (invariant #6) — the day
 * staff are working — computed from the injected UTC {@link Clock}.
 */
@RestController
@RequestMapping("/api/venues")
class StaffBookingController {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final ListDailyBookings dailyBookings;
	private final Clock clock;

	StaffBookingController(ListDailyBookings dailyBookings, Clock clock) {
		this.dailyBookings = dailyBookings;
		this.clock = clock;
	}

	@GetMapping("/{venueId}/bookings")
	List<DailyBookingView> bookings(@PathVariable long venueId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		LocalDate effectiveDate = date != null ? date : LocalDate.ofInstant(clock.instant(), TIRANE);
		return dailyBookings.forVenueOn(new VenueId(venueId), effectiveDate).stream()
				.map(b -> new DailyBookingView(b.setId().value(), b.code()))
				.toList();
	}
}
