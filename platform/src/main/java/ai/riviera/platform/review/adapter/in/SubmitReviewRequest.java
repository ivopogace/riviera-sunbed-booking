package ai.riviera.platform.review.adapter.in;

import ai.riviera.platform.review.application.ReviewSubmission;
import ai.riviera.platform.review.domain.ReviewText;
import ai.riviera.platform.review.domain.Stars;
import ai.riviera.platform.shared.InvalidApiRequestException;

/**
 * The write body shared by submit and amend: the stars, the optional comment, and the display name
 * the review is attributed to. Validated in the compact constructor (§6b — no {@code @Valid}), so
 * an over-long text is a {@code 400} before the use case is reached and V46's length CHECKs stay
 * backstops rather than the validator.
 *
 * <p>Both texts are stripped first, so padding cannot push a legal value over its bound; a comment
 * that is blank once stripped is {@code null} — the guest wrote none. Nothing is ever truncated: a
 * body over the bound is refused, because silently storing half a sentence is worse than saying no.
 * The display name is required, so every review this slice records is attributable.
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
