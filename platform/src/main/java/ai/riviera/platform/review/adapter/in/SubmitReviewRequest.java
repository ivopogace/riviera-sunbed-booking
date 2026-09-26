package ai.riviera.platform.review.adapter.in;

import ai.riviera.platform.review.application.ReviewSubmission;
import ai.riviera.platform.review.domain.ReviewText;
import ai.riviera.platform.review.domain.Stars;
import ai.riviera.platform.shared.InvalidApiRequestException;

/**
 * The write body shared by submit and amend: the stars, the optional comment, and the required
 * display name the review is attributed to. Validated in the compact constructor (§6b, no
 * {@code @Valid}), so an over-long text is a {@code 400} first; V46's CHECKs are backstops.
 *
 * <p>Both texts are stripped first, so padding cannot push a legal value over its bound; a comment
 * blank once stripped is {@code null}. Nothing is ever truncated: a body over the bound is refused.
 * Rationale: RESPONSIBILITIES.md §review.
 */
record SubmitReviewRequest(Integer stars, String comment, String displayName) {

	SubmitReviewRequest {
		if (stars == null || !Stars.isValid(stars)) {
			throw new InvalidApiRequestException(Stars.SCALE_DESCRIPTION);
		}
		comment = blankToNull(stripped(comment));
		displayName = stripped(displayName);
		if (comment != null && !ReviewText.fitsComment(comment)) {
			throw new InvalidApiRequestException(ReviewText.COMMENT_BOUND_DESCRIPTION);
		}
		if (blankToNull(displayName) == null) {
			throw new InvalidApiRequestException(ReviewText.DISPLAY_NAME_REQUIRED_DESCRIPTION);
		}
		if (!ReviewText.fitsDisplayName(displayName)) {
			throw new InvalidApiRequestException(ReviewText.DISPLAY_NAME_BOUND_DESCRIPTION);
		}
	}

	ReviewSubmission toSubmission() {
		return new ReviewSubmission(stars, comment, displayName);
	}

	private static String stripped(String value) {
		return value == null ? null : value.strip();
	}

	private static String blankToNull(String value) {
		return value == null || value.isEmpty() ? null : value;
	}
}
