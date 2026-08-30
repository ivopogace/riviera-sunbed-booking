package ai.riviera.platform.review.adapter.in;

import java.net.URI;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.review.application.SubmitReview;
import ai.riviera.platform.review.vocabulary.SubmitOutcome;
import ai.riviera.platform.shared.ApiProblem;

/**
 * The rate-a-stay endpoint. Driving adapter — depends only on this module's {@link SubmitReview}
 * port (invariant #11). It joins the code-gated {@code /api/bookings/{code}} URL family without
 * touching {@code BookingController}: the resource is the guest's booking, the use case is
 * {@code review}'s. The code is the whole authorization (invariant #7); there is no session.
 *
 * <p>Maps the sealed {@link SubmitOutcome} to HTTP through an exhaustive {@code switch}, so a future
 * outcome cannot fall into an existing arm. Success is {@code 201} with no body — the client
 * re-reads the booking, which is where the new {@code reviewable} state lives.
 */
@RestController
@RequestMapping("/api/bookings")
class ReviewController {

	private final SubmitReview submitReview;

	ReviewController(SubmitReview submitReview) {
		this.submitReview = submitReview;
	}

	@PostMapping("/{code}/review")
	ResponseEntity<?> review(@PathVariable String code, @RequestBody SubmitReviewRequest request) {
		return switch (submitReview.submit(code, request.stars())) {
			case SubmitOutcome.Submitted ignored -> ResponseEntity.status(HttpStatus.CREATED).build();
			case SubmitOutcome.NoSuchStay ignored ->
					error(HttpStatus.NOT_FOUND, "NO_SUCH_BOOKING", "No booking with this code.");
			case SubmitOutcome.NotEligible ignored ->
					error(HttpStatus.CONFLICT, "BOOKING_NOT_COMPLETED", "This stay has not been checked in.");
			case SubmitOutcome.WindowClosed ignored ->
					error(HttpStatus.CONFLICT, "REVIEW_WINDOW_CLOSED", "The review window for this stay has closed.");
			case SubmitOutcome.AlreadyReviewed ignored ->
					error(HttpStatus.CONFLICT, "REVIEW_ALREADY_SUBMITTED", "This stay has already been reviewed.");
		};
	}

	/**
	 * The request path carries the booking code — a bearer credential (invariant #7) — so every error
	 * body answers with the collection path instead, the same answer {@code BookingController} gives
	 * on the sibling code-gated legs. The override itself lives in {@link ApiProblem#responseAt}.
	 */
	private static final URI BOOKINGS_PATH = URI.create("/api/bookings");

	private static ResponseEntity<ProblemDetail> error(HttpStatus status, String code, String detail) {
		return ApiProblem.responseAt(status, code, detail, BOOKINGS_PATH);
	}
}
