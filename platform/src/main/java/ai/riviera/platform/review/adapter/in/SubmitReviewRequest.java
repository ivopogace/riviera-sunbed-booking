package ai.riviera.platform.review.adapter.in;

import ai.riviera.platform.shared.InvalidApiRequestException;

/**
 * The submit body: a star count and nothing else in slice 1. Validated in the compact constructor
 * (§6b — no {@code @Valid}), so an out-of-range value is a {@code 400} before the use case is
 * reached and the DB's {@code review_stars_check} stays a backstop rather than the validator.
 */
record SubmitReviewRequest(Integer stars) {

	private static final int MIN_STARS = 1;
	private static final int MAX_STARS = 5;

	SubmitReviewRequest {
		if (stars == null || stars < MIN_STARS || stars > MAX_STARS) {
			throw new InvalidApiRequestException("stars must be between " + MIN_STARS + " and " + MAX_STARS);
		}
	}
}
