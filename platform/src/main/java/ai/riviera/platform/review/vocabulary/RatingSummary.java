package ai.riviera.platform.review.vocabulary;

/**
 * A venue's rating aggregated over its visible reviews: the mean in tenths (4.5 stars as 45, never
 * floating point — the invariant-#5 discipline applied to the rating) and how many reviews it is
 * over. A venue with no reviews reads {@code 0/0}, which the frontend renders as "New" rather than
 * "0.0".
 *
 * <p>The values a recompute hands {@code venue} to store; {@code venue} writes them to its own
 * columns and remains the only writer of that table.
 */
public record RatingSummary(int ratingTenths, int reviewsCount) {
}
