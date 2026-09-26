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
 * Platform-admin review moderation, the "remove" half of report-and-remove; a driving adapter over
 * the {@link ReviewModeration} port. Role-gated, not venue-scoped: it must reach venues the public
 * list refuses (a suspended owner's), so under {@code /api/admin/**} (invariant #13's exemption)
 * the {@code ADMIN} gate in {@code SecurityConfig} is the whole authorization. Each verb is a
 * {@code POST} to its own path carrying the review id: the audit record has no target column. Hide
 * and un-hide are idempotent {@code 204}s; an unknown review is {@code 404 NO_SUCH_REVIEW}.
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
