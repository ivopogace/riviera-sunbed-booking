package ai.riviera.platform.review.adapter.in;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.review.application.ReviewModeration;
import ai.riviera.platform.review.vocabulary.ModerationOutcome;
import ai.riviera.platform.review.vocabulary.ReviewCursor;
import ai.riviera.platform.review.vocabulary.ReviewRef;
import ai.riviera.platform.review.vocabulary.VenueRef;
import ai.riviera.platform.shared.ApiProblem;
import ai.riviera.platform.shared.InvalidApiRequestException;

/**
 * The platform-admin review moderation surface — the "remove" half of report-and-remove, applied to
 * reviews. Driving adapter depending only on the module's {@link ReviewModeration} port; hosted in
 * the module like the other module-owned admin surfaces.
 *
 * <p><strong>Role-gated, not venue-scoped.</strong> A reported review sits on a venue the admin does
 * not own, and the public list refuses exactly the venues a moderator must still reach (a suspended
 * owner's), so this lives under {@code /api/admin/**}, invariant #13's exemption, and the
 * {@code ADMIN} gate in {@code SecurityConfig} is the whole authorization. Both verbs are
 * {@code POST}s to their own path so the audit record's {@code method path} column reads
 * unambiguously, with the review id in the path — the record has no target column.
 *
 * <p>Hide and un-hide answer {@code 204} whether they changed the row or found it already so
 * (idempotent); only an unknown review is refused, {@code 404 NO_SUCH_REVIEW}.
 */
@RestController
@RequestMapping("/api/admin")
class AdminReviewController {

	private final ReviewModeration moderation;

	AdminReviewController(ReviewModeration moderation) {
		this.moderation = moderation;
	}

	/**
	 * Every review of a venue, newest first, hidden and star-only rows included — the read that makes
	 * the takedown operable. {@code cursor} is the {@code nextCursor} a previous page answered.
	 */
	@GetMapping("/venues/{venueId}/reviews")
	AdminReviewsResponse reviews(@PathVariable long venueId,
			@RequestParam(required = false) Long cursor) {
		if (cursor != null && cursor <= 0) {
			throw new InvalidApiRequestException("reviews: 'cursor' must be a positive review id");
		}
		ReviewCursor from = cursor == null ? ReviewCursor.FIRST_PAGE : new ReviewCursor(cursor);
		return AdminReviewsResponse.from(moderation.pageFor(new VenueRef(venueId), from));
	}

	@PostMapping("/reviews/{reviewId}/hide")
	ResponseEntity<?> hide(@PathVariable long reviewId) {
		return moderated(moderation.hide(new ReviewRef(reviewId)));
	}

	@PostMapping("/reviews/{reviewId}/unhide")
	ResponseEntity<?> unhide(@PathVariable long reviewId) {
		return moderated(moderation.unhide(new ReviewRef(reviewId)));
	}

	private static ResponseEntity<?> moderated(ModerationOutcome outcome) {
		return switch (outcome) {
			case ModerationOutcome.Applied ignored -> ResponseEntity.noContent().build();
			case ModerationOutcome.AlreadyApplied ignored -> ResponseEntity.noContent().build();
			case ModerationOutcome.NoSuchReview ignored ->
					ApiProblem.response(HttpStatus.NOT_FOUND, "NO_SUCH_REVIEW", "No review with this id.");
		};
	}
}
