package ai.riviera.platform.booking.adapter.in;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.ApiProblem;
import ai.riviera.platform.CurrentOperator;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.request.AcceptOutcome;
import ai.riviera.platform.booking.application.request.DeclineOutcome;
import ai.riviera.platform.booking.application.request.PendingRequests;
import ai.riviera.platform.booking.application.request.RespondToRequest;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Operator endpoints for the Request-to-Book queue (issue #98): list the venue's pending
 * requests, accept one (issues the payment request — payment-request-on-accept), or decline one
 * (releases the hold). Driving adapter over the booking module's {@link PendingRequests} and
 * {@link RespondToRequest} ports (invariant #11); per-venue ownership is enforced in those
 * services, a mismatch surfacing as {@code NotVenueOwnerException} → {@code 403 NOT_VENUE_OWNER}
 * via the single {@code ApiErrorHandler} (invariant #13 — no per-controller handler, issue #97).
 * Rejections are RFC-7807 {@code ProblemDetail}s built by {@link ApiProblem} with stable codes;
 * no booking code appears in any response here (invariant #7 — the queue is id-based).
 */
@RestController
@RequestMapping("/api/venues/{venueId}/booking-requests")
class BookingRequestController {

	private final PendingRequests pendingRequests;
	private final RespondToRequest respondToRequest;
	private final CurrentOperator currentOperator;

	BookingRequestController(PendingRequests pendingRequests, RespondToRequest respondToRequest,
			CurrentOperator currentOperator) {
		this.pendingRequests = pendingRequests;
		this.respondToRequest = respondToRequest;
		this.currentOperator = currentOperator;
	}

	@GetMapping
	List<PendingRequestView> list(Authentication authentication, @PathVariable long venueId) {
		OperatorId operator = currentOperator.require(authentication);
		return pendingRequests.forVenue(operator, new VenueId(venueId)).stream()
				.map(PendingRequestView::of)
				.toList();
	}

	@PostMapping("/{bookingId}/accept")
	ResponseEntity<?> accept(Authentication authentication, @PathVariable long venueId,
			@PathVariable long bookingId) {
		OperatorId operator = currentOperator.require(authentication);
		AcceptOutcome outcome =
				respondToRequest.accept(operator, new VenueId(venueId), new BookingId(bookingId));
		return switch (outcome) {
			case AcceptOutcome.Accepted accepted ->
					ResponseEntity.ok(new RequestDecisionView(bookingId, accepted.status().name()));
			case AcceptOutcome.Rejected rejected -> switch (rejected) {
				case NO_SUCH_REQUEST -> problem(HttpStatus.NOT_FOUND, "NO_SUCH_REQUEST",
						"No pending request with this id at this venue.");
				case NOT_PENDING -> problem(HttpStatus.CONFLICT, "REQUEST_NOT_PENDING",
						"This request has already been decided.");
				case EXPIRED -> problem(HttpStatus.CONFLICT, "REQUEST_EXPIRED",
						"This request's response deadline has passed.");
				case PAYMENT_INIT_FAILED -> problem(HttpStatus.BAD_GATEWAY, "PAYMENT_INIT_FAILED",
						"The payment request could not be issued; please retry.");
			};
		};
	}

	@PostMapping("/{bookingId}/decline")
	ResponseEntity<?> decline(Authentication authentication, @PathVariable long venueId,
			@PathVariable long bookingId) {
		OperatorId operator = currentOperator.require(authentication);
		DeclineOutcome outcome =
				respondToRequest.decline(operator, new VenueId(venueId), new BookingId(bookingId));
		return switch (outcome) {
			case DeclineOutcome.Declined ignored ->
					ResponseEntity.ok(new RequestDecisionView(bookingId,
							ai.riviera.platform.booking.domain.BookingStatus.DECLINED.name()));
			case DeclineOutcome.Rejected rejected -> switch (rejected) {
				case NO_SUCH_REQUEST -> problem(HttpStatus.NOT_FOUND, "NO_SUCH_REQUEST",
						"No pending request with this id at this venue.");
				case NOT_PENDING -> problem(HttpStatus.CONFLICT, "REQUEST_NOT_PENDING",
						"This request has already been decided.");
			};
		};
	}

	private static ResponseEntity<Object> problem(HttpStatus status, String code, String detail) {
		return ResponseEntity.status(status).body(ApiProblem.of(status, code, detail));
	}
}
