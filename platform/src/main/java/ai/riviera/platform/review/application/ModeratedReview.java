package ai.riviera.platform.review.application;

import java.time.Instant;
import java.time.YearMonth;

import ai.riviera.platform.review.vocabulary.ReviewRef;

/**
 * One review as a platform admin sees it while moderating: everything the public sees, plus the
 * rows the public never does — a star-only review ({@code comment} {@code null}) and a hidden one
 * ({@code hiddenAt} set). The stay stays a month: the admin needs no more precision than a tourist.
 */
public record ModeratedReview(ReviewRef ref, int stars, String displayName, YearMonth stayedIn,
		String comment, Instant createdAt, Instant hiddenAt) {
}
