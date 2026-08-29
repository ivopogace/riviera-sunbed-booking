package ai.riviera.platform.review.application;

/**
 * The raw totals a venue's review rows add up to, before the mean is taken — what the store can
 * answer, kept separate from {@link ai.riviera.platform.review.vocabulary.RatingSummary}, which is
 * what callers are told. The rounding rule lives with the domain math, not in SQL.
 */
public record ReviewTotals(int count, long sumStars) {
}
