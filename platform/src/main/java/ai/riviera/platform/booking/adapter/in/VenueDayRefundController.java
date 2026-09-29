package ai.riviera.platform.booking.adapter.in;

import java.net.URI;
import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.booking.application.refund.RefundVenueDay;
import ai.riviera.platform.booking.application.refund.VenueDayRefundOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.CurrentOperator;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The operator's venue day refund (ADR-0027): {@code POST /api/venues/{venueId}/bookings/{code}/day-refund?date=}
 * refunds that guest's that day through the {@link RefundVenueDay} port (#11), the amount server-decided
 * (#10). {@code date} is required: an implicit today could refund the wrong day. The code travels in the
 * path as check-in's does (ADR-0006) and never comes back: every problem body keeps a code-free {@code
 * instance} (invariant #7). Operator-gated: {@code SecurityConfig} matches this POST to {@code OPERATOR}
 * before the public venue rules; ownership is the service's (#13).
 */
@RestController
@RequestMapping("/api/venues")
class VenueDayRefundController {

	private final RefundVenueDay refundVenueDay;
	private final CurrentOperator currentOperator;

	VenueDayRefundController(RefundVenueDay refundVenueDay, CurrentOperator currentOperator) {
		this.refundVenueDay = refundVenueDay;
		this.currentOperator = currentOperator;
	}

	@PostMapping("/{venueId}/bookings/{code}/day-refund")
	ResponseEntity<?> refund(Authentication authentication, @PathVariable long venueId, @PathVariable String code,
			@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
		OperatorId operator = currentOperator.require(authentication);
		return switch (refundVenueDay.refundDay(operator, new VenueId(venueId), code, date)) {
			case VenueDayRefundOutcome.DayRefunded(var refundMinor, var currency, var released) ->
					ResponseEntity.ok(VenueDayRefundView.dayRefunded(date, refundMinor, currency, released));
			case VenueDayRefundOutcome.BookingCancelled(var refundMinor, var currency) ->
					ResponseEntity.ok(VenueDayRefundView.bookingCancelled(date, refundMinor, currency));
			case VenueDayRefundOutcome.DayAttended() -> error(venueId, HttpStatus.CONFLICT, "DAY_ATTENDED",
					"The guest checked in on " + date + "; an attended day is not refunded.");
			case VenueDayRefundOutcome.DayAlreadyRefunded() -> error(venueId, HttpStatus.CONFLICT,
					"DAY_ALREADY_REFUNDED", "The day " + date + " was already refunded.");
			case VenueDayRefundOutcome.NotFound() -> error(venueId, HttpStatus.NOT_FOUND, "BOOKING_NOT_FOUND",
					"No such booking covers " + date + " at this venue.");
		};
	}

	private static ResponseEntity<ProblemDetail> error(long venueId, HttpStatus status, String code, String detail) {
		ProblemDetail problem = ApiProblem.of(status, code, detail);
		problem.setInstance(URI.create("/api/venues/" + venueId + "/bookings"));
		return ResponseEntity.status(status).body(problem);
	}
}
