package ai.riviera.platform.booking.adapter.in;

import java.net.URI;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;

import ai.riviera.platform.booking.application.reserve.BookingOutcome;
import ai.riviera.platform.shared.ApiProblem;

/**
 * The one mapping of a reserve refusal to its RFC-7807 answer, shared by the booking and the stay
 * create endpoints: {@code SET_TAKEN}→409, {@code NO_SUCH_SET}→404, the rest 422.
 */
final class Rejections {

	private Rejections() {
	}

	static ResponseEntity<ProblemDetail> respond(BookingOutcome.Rejected rejected, URI path) {
		return switch (rejected) {
			case SET_TAKEN -> ApiProblem.responseAt(HttpStatus.CONFLICT, "SET_TAKEN",
					"The set is already taken for this date.", path);
			case NOT_ONLINE_POOL -> ApiProblem.responseAt(HttpStatus.UNPROCESSABLE_ENTITY, "SET_NOT_BOOKABLE_ONLINE",
					"This set is not bookable online.", path);
			case BOOKING_CLOSED -> ApiProblem.responseAt(HttpStatus.UNPROCESSABLE_ENTITY, "BOOKING_CLOSED",
					"Online booking for this date has closed.", path);
			case VENUE_CLOSED -> ApiProblem.responseAt(HttpStatus.UNPROCESSABLE_ENTITY, "VENUE_CLOSED",
					"The venue is closed for the season on this date.", path);
			case NO_SUCH_SET -> ApiProblem.responseAt(HttpStatus.NOT_FOUND, "NO_SUCH_SET", "No such set.", path);
			case RANGE_NOT_OFFERED -> ApiProblem.responseAt(HttpStatus.UNPROCESSABLE_ENTITY, "RANGE_NOT_OFFERED",
					"This venue takes one day at a time online.", path);
			case STAY_TOO_LONG -> ApiProblem.responseAt(HttpStatus.UNPROCESSABLE_ENTITY, "STAY_TOO_LONG",
					"The stay is longer than this venue's maximum stay length.", path);
		};
	}
}
