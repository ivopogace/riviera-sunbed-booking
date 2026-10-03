package ai.riviera.platform.booking.adapter.in;

import java.time.LocalDate;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import ai.riviera.platform.booking.application.refund.VenueDayRefundOutcome;
import ai.riviera.platform.shared.ApiProblem;

/**
 * The one mapping of a {@link VenueDayRefundOutcome} to HTTP, shared by the operator's and the admin's
 * entry: a {@code 200} {@link VenueDayRefundView}, or an RFC-7807 problem with a stable {@code code}.
 */
final class VenueDayRefundResponses {

	private VenueDayRefundResponses() {
	}

	static ResponseEntity<?> of(VenueDayRefundOutcome outcome, LocalDate date) {
		return switch (outcome) {
			case VenueDayRefundOutcome.DayRefunded(var refundMinor, var currency, var released) ->
					ResponseEntity.ok(VenueDayRefundView.dayRefunded(date, refundMinor, currency, released));
			case VenueDayRefundOutcome.BookingCancelled(var refundMinor, var currency) ->
					ResponseEntity.ok(VenueDayRefundView.bookingCancelled(date, refundMinor, currency));
			case VenueDayRefundOutcome.DayAttended() -> ApiProblem.response(HttpStatus.CONFLICT, "DAY_ATTENDED",
					"The guest checked in on " + date + "; an attended day is not refunded.");
			case VenueDayRefundOutcome.DayAlreadyRefunded() -> ApiProblem.response(HttpStatus.CONFLICT,
					"DAY_ALREADY_REFUNDED", "The day " + date + " was already refunded.");
			case VenueDayRefundOutcome.NotFound() -> ApiProblem.response(HttpStatus.NOT_FOUND, "BOOKING_NOT_FOUND",
					"No such booking that happened covers " + date + ".");
		};
	}
}
