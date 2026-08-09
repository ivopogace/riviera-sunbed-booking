package ai.riviera.platform.booking.adapter.in;

import java.net.URI;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.booking.application.checkin.CheckInBooking;
import ai.riviera.platform.booking.application.checkin.CheckInResult;
import ai.riviera.platform.booking.application.view.ListDailyBookings;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

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
	private final CheckInBooking checkInBooking;
	private final CurrentOperator currentOperator;
	private final Clock clock;

	StaffBookingController(ListDailyBookings dailyBookings, CheckInBooking checkInBooking,
			CurrentOperator currentOperator, Clock clock) {
		this.dailyBookings = dailyBookings;
		this.checkInBooking = checkInBooking;
		this.currentOperator = currentOperator;
		this.clock = clock;
	}

	@GetMapping("/{venueId}/bookings")
	List<DailyBookingView> bookings(Authentication authentication, @PathVariable long venueId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		OperatorId operator = currentOperator.require(authentication);
		LocalDate effectiveDate = date != null ? date : LocalDate.ofInstant(clock.instant(), TIRANE);
		return dailyBookings.forVenueOn(operator, new VenueId(venueId), effectiveDate).stream()
				.map(b -> new DailyBookingView(b.setId().value(), b.code(), b.checkedIn()))
				.toList();
	}

	/**
	 * The staff check-in (#583): scan or type the booking code, transition it
	 * {@code CONFIRMED → COMPLETED} exactly once. The code travels in the path (ADR-0006's standing
	 * convention) and never comes back: the success view carries set + date, and every problem body
	 * keeps the redacted/overridden {@code instance} plus a date-only detail (invariant #7).
	 */
	@PostMapping("/{venueId}/bookings/{code}/check-in")
	ResponseEntity<?> checkIn(Authentication authentication, @PathVariable long venueId,
			@PathVariable String code) {
		OperatorId operator = currentOperator.require(authentication);
		return switch (checkInBooking.checkIn(operator, new VenueId(venueId), code)) {
			case CheckInResult.CheckedIn(var setId, var bookingDate) ->
					ResponseEntity.ok(new CheckInView(setId.value(), bookingDate));
			case CheckInResult.AlreadyCheckedIn(var bookingDate) ->
					error(venueId, HttpStatus.CONFLICT, "ALREADY_CHECKED_IN",
							"This booking was already checked in.", bookingDate);
			case CheckInResult.WrongServiceDate(var bookingDate) ->
					error(venueId, HttpStatus.CONFLICT, "WRONG_SERVICE_DATE",
							"This booking is for " + bookingDate + ".", bookingDate);
			case CheckInResult.NotFound() ->
					error(venueId, HttpStatus.NOT_FOUND, "BOOKING_NOT_FOUND",
							"No such booking at this venue.", null);
		};
	}

	/** Problem bodies point {@code instance} at the code-free collection path (invariant #7). */
	private static ResponseEntity<ProblemDetail> error(long venueId, HttpStatus status, String code,
			String detail, LocalDate bookingDate) {
		ProblemDetail problem = ApiProblem.of(status, code, detail);
		problem.setInstance(URI.create("/api/venues/" + venueId + "/bookings"));
		if (bookingDate != null) {
			problem.setProperty("bookingDate", bookingDate.toString());
		}
		return ResponseEntity.status(status).body(problem);
	}
}
