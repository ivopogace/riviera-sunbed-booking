package ai.riviera.platform.booking.adapter.in;

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

import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.booking.application.checkin.CheckInBooking;
import ai.riviera.platform.booking.application.checkin.CheckInResult;
import ai.riviera.platform.booking.application.view.ListDailyBookings;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Operator endpoints for the staff daily view: a venue's settled bookings covering one day —
 * each with set, code, stay outcome, the guest's span and the day's attendance — plus the check-in
 * POST. Depends only on the {@link ListDailyBookings} and {@link CheckInBooking} ports (#11).
 *
 * <p><strong>Operator-gated</strong>, never public: codes are bearer credentials (invariant #7).
 * {@code SecurityConfig} must match this GET to {@code OPERATOR} <em>before</em> the public venue
 * GET rule (unauthenticated: {@code 401}). {@code date} defaults to today in Tirane (invariant #6).
 */
@RestController
@RequestMapping("/api/venues")
class StaffBookingController {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final ListDailyBookings dailyBookings;
	private final CheckInBooking checkInBooking;
	private final OperatorDirectory operatorDirectory;
	private final Clock clock;

	StaffBookingController(ListDailyBookings dailyBookings, CheckInBooking checkInBooking,
			OperatorDirectory operatorDirectory, Clock clock) {
		this.dailyBookings = dailyBookings;
		this.checkInBooking = checkInBooking;
		this.operatorDirectory = operatorDirectory;
		this.clock = clock;
	}

	@GetMapping("/{venueId}/bookings")
	List<DailyBookingView> bookings(Authentication authentication, @PathVariable long venueId,
			@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		OperatorId operator = operatorDirectory.requireOperator(authentication.getName());
		LocalDate effectiveDate = date != null ? date : LocalDate.ofInstant(clock.instant(), TIRANE);
		return dailyBookings.forVenueOn(operator, new VenueId(venueId), effectiveDate).stream()
				.map(DailyBookingView::of)
				.toList();
	}

	/**
	 * Stamps the scanned or typed code's guest as attended today, exactly once. The code travels in
	 * the path (ADR-0006) and never comes back: the success view carries set + date, and every
	 * problem body a date-only detail (invariant #7).
	 */
	@PostMapping("/{venueId}/bookings/{code}/check-in")
	ResponseEntity<?> checkIn(Authentication authentication, @PathVariable long venueId,
			@PathVariable String code) {
		OperatorId operator = operatorDirectory.requireOperator(authentication.getName());
		return switch (checkInBooking.checkIn(operator, new VenueId(venueId), code)) {
			case CheckInResult.CheckedIn(var setId, var bookingDate) ->
					ResponseEntity.ok(new CheckInView(setId.value(), bookingDate));
			case CheckInResult.AlreadyCheckedIn(var bookingDate, var setId) ->
					error(HttpStatus.CONFLICT, "ALREADY_CHECKED_IN",
							"This booking was already checked in today.", bookingDate, setId);
			case CheckInResult.WrongServiceDate(var bookingDate) ->
					error(HttpStatus.CONFLICT, "WRONG_SERVICE_DATE",
							"This booking is for " + bookingDate + ".", bookingDate, null);
			case CheckInResult.DayRefunded(var bookingDate, var setId) ->
					error(HttpStatus.CONFLICT, "DAY_REFUNDED",
							"This day was refunded for weather.", bookingDate, setId);
			case CheckInResult.DayReleased(var bookingDate, var setId) ->
					error(HttpStatus.CONFLICT, "DAY_RELEASED",
							"This day was refunded by the venue and the spot released.", bookingDate, setId);
			case CheckInResult.NotFound() ->
					error(HttpStatus.NOT_FOUND, "BOOKING_NOT_FOUND",
							"No such booking at this venue.", null, null);
		};
	}

	/** A repeat scan's problem body also names today's set, so staff can point the guest to it on a move day. */
	private static ResponseEntity<ProblemDetail> error(HttpStatus status, String code,
			String detail, LocalDate bookingDate, SetId setId) {
		ProblemDetail problem = ApiProblem.of(status, code, detail);
		if (bookingDate != null) {
			problem.setProperty("bookingDate", bookingDate.toString());
		}
		if (setId != null) {
			problem.setProperty("setId", setId.value());
		}
		return ResponseEntity.status(status).body(problem);
	}
}
