package ai.riviera.platform.review.adapter.in;

import java.net.URI;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.review.application.ReviewLifecycle;
import ai.riviera.platform.review.vocabulary.AmendOutcome;
import ai.riviera.platform.review.vocabulary.SubmitOutcome;
import ai.riviera.platform.shared.ApiProblem;

/**
 * The rate-a-stay endpoint. Driving adapter — depends only on this module's
 * {@link ReviewLifecycle} port (invariant #11). It joins the code-gated {@code /api/bookings/{code}} URL family without
 * touching {@code BookingController}: the resource is the guest's booking, the use case is
 * {@code review}'s. The code is the whole authorization (invariant #7); there is no session.
 *
 * <p>All three verbs live on one path — the guest's one review — and each maps its sealed outcome
 * to HTTP through an exhaustive {@code switch}, so a future outcome cannot fall into an existing
 * arm. Success carries no body: the client re-reads the booking, which is where the review's new
 * state lives.
 */
@RestController
@RequestMapping("/api/bookings")
class ReviewController {

	private final ReviewLifecycle lifecycle;

	ReviewController(ReviewLifecycle lifecycle) {
		this.lifecycle = lifecycle;
	}

	@PostMapping("/{code}/review")
	ResponseEntity<?> review(@PathVariable String code, @RequestBody SubmitReviewRequest request) {
		return switch (lifecycle.submit(code, request.toSubmission())) {
			case SubmitOutcome.Submitted ignored -> ResponseEntity.status(HttpStatus.CREATED).build();
			case SubmitOutcome.NoSuchStay ignored -> noSuchBooking();
			case SubmitOutcome.NotEligible ignored -> notCheckedIn();
			case SubmitOutcome.WindowClosed ignored -> windowClosed();
			case SubmitOutcome.AlreadyReviewed ignored ->
					error(HttpStatus.CONFLICT, "REVIEW_ALREADY_SUBMITTED", "This stay has already been reviewed.");
		};
	}

	@PutMapping("/{code}/review")
	ResponseEntity<?> updateReview(@PathVariable String code,
			@RequestBody SubmitReviewRequest request) {
		return amended(lifecycle.edit(code, request.toSubmission()));
	}

	@DeleteMapping("/{code}/review")
	ResponseEntity<?> deleteReview(@PathVariable String code) {
		return amended(lifecycle.delete(code));
	}

	private static ResponseEntity<?> amended(AmendOutcome outcome) {
		return switch (outcome) {
			case AmendOutcome.Done ignored -> ResponseEntity.noContent().build();
			case AmendOutcome.NoSuchStay ignored -> noSuchBooking();
			case AmendOutcome.NoSuchReview ignored ->
					error(HttpStatus.NOT_FOUND, "NO_SUCH_REVIEW", "This stay carries no review.");
			case AmendOutcome.NotEligible ignored -> notCheckedIn();
			case AmendOutcome.WindowClosed ignored -> windowClosed();
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

	/**
	 * The three refusals both switches can reach, each stated once. Submit and amend answer one
	 * condition in one wording because they call the same method, not because two literals agree.
	 */
	private static ResponseEntity<ProblemDetail> noSuchBooking() {
		return error(HttpStatus.NOT_FOUND, "NO_SUCH_BOOKING", "No booking with this code.");
	}

	private static ResponseEntity<ProblemDetail> notCheckedIn() {
		return error(HttpStatus.CONFLICT, "BOOKING_NOT_COMPLETED", "This stay has not been checked in.");
	}

	private static ResponseEntity<ProblemDetail> windowClosed() {
		return error(HttpStatus.CONFLICT, "REVIEW_WINDOW_CLOSED",
				"The review window for this stay has closed.");
	}
}
