package ai.riviera.platform.review.domain;

/**
 * A venue's mean star rating, in tenths. Pure integer arithmetic, no Spring — the invariant-#5
 * discipline (integer minor units, never floating point) applied to the rating, so the stored value
 * is exactly reproducible from the rows it summarises.
 */
public final class AggregateRating {

	private static final int TENTHS = 10;

	private AggregateRating() {
	}

	/**
	 * The mean of {@code count} reviews totalling {@code sumStars}, in tenths, <strong>rounded
	 * half-up</strong> by adding {@code count / 2} before the truncating division (3.75 ⇒ 38).
	 * Zero reviews returns {@code 0} (read as {@code 0/0}, rendered "New"); otherwise 10..50.
	 */
	public static int tenths(long sumStars, int count) {
		if (count == 0) {
			return 0;
		}
		return (int) ((TENTHS * sumStars + count / 2) / count);
	}
}
