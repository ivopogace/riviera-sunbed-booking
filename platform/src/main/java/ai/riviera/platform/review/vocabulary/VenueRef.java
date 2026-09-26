package ai.riviera.platform.review.vocabulary;

/**
 * The {@code review} module's own reference to a venue (invariant #11 — a typed id at the seam, not
 * a raw {@code long}). Callers convert with {@code new VenueRef(venueId.value())}.
 *
 * <p>Never swap in {@code venue.vocabulary.VenueId}: {@code venue} consumes this module (via
 * {@link ai.riviera.platform.review.api.VenueRatingSummary}), so a {@code review → venue} edge
 * would close a Modulith cycle. Rationale: RESPONSIBILITIES.md §review
 */
public record VenueRef(long value) {
}
