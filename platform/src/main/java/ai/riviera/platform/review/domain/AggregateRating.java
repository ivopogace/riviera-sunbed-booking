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
	 * half-up</strong>: adding {@code count / 2} before the truncating division is what lifts an
	 * exact half to the next tenth (3.75 stars ⇒ 38, not 37).
	 *
	 * <p>Zero reviews short-circuits to {@code 0} before the division — a venue with none reads
	 * {@code 0/0}, which the surfaces render as "New" rather than "0.0". With stars bounded 1..5 the
	 * result is otherwise 10..50, inside venue's {@code rating_tenths BETWEEN 0 AND 50} check.
	 */
	public static int tenths(long sumStars, int count) {
		if (count == 0) {
			return 0;
		}
		return (int) ((TENTHS * sumStars + count / 2) / count);
	}
}
