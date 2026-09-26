package ai.riviera.platform.review.events;

import ai.riviera.platform.review.vocabulary.VenueRef;

/**
 * Published when a venue's set of visible reviews changes, so its stored aggregate is stale. The
 * {@code venue} listener recomputes {@code rating_tenths}/{@code reviews_count} by a full re-read
 * through {@link ai.riviera.platform.review.api.VenueRatingSummary}, never an increment from the
 * event, so at-least-once redelivery converges instead of drifting.
 *
 * <p>Id-based payload (invariant #11): only the stale venue. Never add the score; it would be a
 * second source of truth racing the table.
 */
public record ReviewsChanged(VenueRef venue) {
}
