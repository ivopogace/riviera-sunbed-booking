package ai.riviera.platform.operator.vocabulary;

/**
 * The {@code operator} module's own typed venue id at the seam (invariant #11), used instead of
 * {@code venue.vocabulary.VenueId}: {@code venue} depends on {@code operator::api} for
 * {@link ai.riviera.platform.operator.api.VenueOwnership VenueOwnership}, so naming {@code VenueId}
 * here would close a Modulith cycle. Callers convert with {@code new VenueRef(venueId.value())}.
 * Rationale: ADR-0007 (note on the copied id records).
 */
public record VenueRef(long value) {
}
