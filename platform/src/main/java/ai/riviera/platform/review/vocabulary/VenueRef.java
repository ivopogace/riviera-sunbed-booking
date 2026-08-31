package ai.riviera.platform.review.vocabulary;

/**
 * The {@code review} module's own reference to a venue (invariant #11 — a typed id at the seam, not
 * a raw {@code long}).
 *
 * <p><strong>Why not reuse {@code venue.vocabulary.VenueId}?</strong> The same reason
 * {@code operator} publishes its own: {@code venue} is a <em>consumer</em> of this module (its
 * listener queries {@link ai.riviera.platform.review.api.VenueRatingSummary}), so a
 * {@code review → venue} edge for the id type would close a Spring Modulith cycle. Publishing a
 * dedicated ref keeps {@code allowedDependencies = { "shared" }} exactly. Callers convert with
 * {@code new VenueRef(venueId.value())}.
 */
public record VenueRef(long value) {
}
