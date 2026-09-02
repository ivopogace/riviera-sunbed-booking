package ai.riviera.platform.review.adapter.in;

import java.time.Instant;
import java.util.List;

import ai.riviera.platform.review.application.ModeratedReview;
import ai.riviera.platform.review.application.ModerationPage;
import ai.riviera.platform.review.vocabulary.ReviewCursor;

/**
 * The wire response for {@code GET /api/admin/venues/{venueId}/reviews}: one page of a venue's
 * reviews as the admin moderates them, newest first, and the cursor that reads the next older page —
 * {@code null} when this page ends the list. An object wrapping the array, the shape every list read
 * here takes.
 */
record AdminReviewsResponse(List<ReviewEntry> reviews, Long nextCursor) {

	/**
	 * One review under moderation. {@code comment} is {@code null} for a star-only review,
	 * {@code hiddenAt} for a review still in public view; {@code stayedIn} is an ISO year-month.
	 */
	record ReviewEntry(long id, int stars, String displayName, String stayedIn, String comment,
			Instant createdAt, Instant hiddenAt) {

		static ReviewEntry from(ModeratedReview review) {
			return new ReviewEntry(review.ref().value(), review.stars(), review.displayName(),
					review.stayedIn().toString(), review.comment(), review.createdAt(), review.hiddenAt());
		}
	}

	static AdminReviewsResponse from(ModerationPage page) {
		return new AdminReviewsResponse(page.reviews().stream().map(ReviewEntry::from).toList(),
				page.next().map(ReviewCursor::beforeId).orElse(null));
	}
}
