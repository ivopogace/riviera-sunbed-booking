package ai.riviera.platform.review.vocabulary;

import java.time.YearMonth;

/**
 * One review as the public reads it on the venue page: the stars, the name it is attributed to,
 * the month of the stay, and the guest's words. Only a review that carries a comment is listed, so
 * {@code comment} is never {@code null} here; {@code displayName} is {@code null} only for a row
 * written before display names were required.
 *
 * <p>The stay is a {@link YearMonth}, deliberately: the review row knows the day, but a public
 * listing that named it would let a reader place a guest at the venue on a date, so the day is
 * dropped before the value leaves the store.
 */
public record ListedReview(ReviewRef ref, int stars, String displayName, YearMonth stayedIn,
		String comment) {
}
