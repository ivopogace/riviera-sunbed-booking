package ai.riviera.platform.review.adapter.in;

import ai.riviera.platform.review.domain.Stars;
import ai.riviera.platform.shared.InvalidApiRequestException;

/**
 * The submit body: a star count and nothing else in slice 1. Validated in the compact constructor
 * (§6b — no {@code @Valid}), so an out-of-range value is a {@code 400} before the use case is
 * reached and the DB's {@code review_stars_check} stays a backstop rather than the validator.
 */
record SubmitReviewRequest(Integer stars) {

	SubmitReviewRequest {
		if (stars == null || !Stars.isValid(stars)) {
			throw new InvalidApiRequestException(Stars.SCALE_DESCRIPTION);
		}
	}
}
