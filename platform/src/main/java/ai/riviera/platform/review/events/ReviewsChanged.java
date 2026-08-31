package ai.riviera.platform.review.events;

import ai.riviera.platform.review.vocabulary.VenueRef;

/**
 * Published when a venue's set of visible reviews changes, so the venue's stored aggregate no longer
 * matches it. The {@code venue} module's listener consumes it and recomputes its own
 * {@code rating_tenths}/{@code reviews_count} — a full re-read through
 * {@link ai.riviera.platform.review.api.VenueRatingSummary}, never an increment applied from the
 * event, so redelivery converges instead of drifting (the registry is at-least-once).
 *
 * <p>Id-based payload (invariant #11): the venue whose aggregate is stale, and nothing else. The
 * computed score is not carried deliberately — an event that carried it would be a second source of
 * truth racing the table it describes, and invariant #11 keeps payloads to technical ids.
 */
public record ReviewsChanged(VenueRef venue) {
}
