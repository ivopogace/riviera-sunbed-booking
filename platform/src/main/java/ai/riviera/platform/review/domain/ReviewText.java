package ai.riviera.platform.review.domain;

/**
 * The bounds on a review's free text — the one Java statement of them, the way {@link Stars} states
 * the rating scale. The driving adapter validates incoming bodies against these, so a too-long
 * comment is a {@code 400} rather than a constraint violation on an aborted transaction.
 *
 * <p>V46's {@code review_comment_length_check} and {@code review_display_name_length_check} state
 * the same bounds independently and stay the backstop; {@code char_length} counts characters, which
 * is what {@link String#codePointCount} counts here, so the two agree on astral characters too.
 */
public final class ReviewText {

	public static final int COMMENT_MAX = 1000;
	public static final int DISPLAY_NAME_MAX = 60;

	/** The messages both validators use, so a caller reads the same bound whichever one rejected. */
	public static final String COMMENT_BOUND_DESCRIPTION =
			"comment must be at most " + COMMENT_MAX + " characters";
	public static final String DISPLAY_NAME_BOUND_DESCRIPTION =
			"display name must be at most " + DISPLAY_NAME_MAX + " characters";
	public static final String DISPLAY_NAME_REQUIRED_DESCRIPTION = "display name must not be blank";

	private ReviewText() {
	}

	public static boolean fitsComment(String comment) {
		return comment.codePointCount(0, comment.length()) <= COMMENT_MAX;
	}

	public static boolean fitsDisplayName(String displayName) {
		return displayName.codePointCount(0, displayName.length()) <= DISPLAY_NAME_MAX;
	}
}
