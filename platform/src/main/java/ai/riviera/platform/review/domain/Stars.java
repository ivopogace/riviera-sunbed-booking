package ai.riviera.platform.review.domain;

/**
 * The rating scale — 1 to 5 stars — as the one Java statement of it. The driving adapter validates
 * incoming requests against it and the submit use case guards on it, so widening the scale is one
 * edit here rather than a hunt through both.
 *
 * <p>The database's {@code review_stars_check} states the same bounds independently and stays the
 * backstop: it is the only one of the two that also holds for a row written by anything but this
 * application, so the duplication there is deliberate, not drift.
 */
public final class Stars {

	public static final int MIN = 1;
	public static final int MAX = 5;

	/** The message both validators use, so a caller reads the same bounds whichever one rejected. */
	public static final String SCALE_DESCRIPTION = "stars must be between " + MIN + " and " + MAX;

	private Stars() {
	}

	public static boolean isValid(int stars) {
		return stars >= MIN && stars <= MAX;
	}
}
