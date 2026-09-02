package ai.riviera.platform.venue.adapter.in;

import java.util.List;

import ai.riviera.platform.review.vocabulary.ListedReview;
import ai.riviera.platform.review.vocabulary.ReviewPage;

/**
 * The wire response for {@code GET /api/venues/{venueId}/reviews}: one page of a venue's listed
 * reviews, newest first, and the cursor that reads the next older page — {@code null} when this
 * page ends the list. An object wrapping the array, the shape every list read here takes, so the
 * page can grow a field without breaking its clients.
 */
record VenueReviewsResponse(List<ReviewEntry> reviews, Long nextCursor) {

	/**
	 * One listed review. {@code stayedIn} is an ISO year-month ({@code 2026-07}) and never a day: the
	 * month places the stay in a season, the day would place a guest at the venue.
	 */
	record ReviewEntry(long id, int stars, String displayName, String stayedIn, String comment) {

		static ReviewEntry from(ListedReview review) {
			return new ReviewEntry(review.ref().value(), review.stars(), review.displayName(),
					review.stayedIn().toString(), review.comment());
		}
	}

	static VenueReviewsResponse from(ReviewPage page) {
		return new VenueReviewsResponse(page.reviews().stream().map(ReviewEntry::from).toList(),
				page.next().map(cursor -> cursor.beforeId()).orElse(null));
	}
}
