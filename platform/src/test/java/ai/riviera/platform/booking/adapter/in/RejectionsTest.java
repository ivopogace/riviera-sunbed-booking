package ai.riviera.platform.booking.adapter.in;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;

import ai.riviera.platform.booking.application.reserve.BookingOutcome;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** The problem answer for a refused collection: the guest gets a code, not an unmapped failure. */
class RejectionsTest {

	@Test
	void aCollectionSpanningVenuesIsAClientProblem() {
		ResponseEntity<ProblemDetail> response = Rejections.respond(BookingOutcome.Rejected.SPANS_VENUES);

		assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, response.getStatusCode());
		assertEquals("SPANS_VENUES", response.getBody().getProperties().get("code"));
	}
}
