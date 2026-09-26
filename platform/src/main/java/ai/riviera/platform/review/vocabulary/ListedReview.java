package ai.riviera.platform.review.vocabulary;

import java.time.YearMonth;

/**
 * One review as the public reads it on the venue page: stars, attributed name, month of stay and
 * the guest's words. Only a review with a comment is listed, so {@code comment} is never
 * {@code null}; {@code displayName} is {@code null} only for rows predating required names.
 *
 * <p>The stay is a {@link YearMonth}: never publish the day, which would let a reader place a guest
 * at the venue on a date; it is dropped before the value leaves the store.
 */
public record ListedReview(ReviewRef ref, int stars, String displayName, YearMonth stayedIn,
		String comment) {
}
