package ai.riviera.platform.venue.application;

/**
 * One row of the operator's own-venues picker: technical id, name, and beach. Carries
 * <strong>no</strong> commission, payout currency, availability or pricing; the operator-only
 * financial fields have their own owner-asserted read ({@link VenueProfileView}).
 *
 * <p>The {@code id} is a plain {@code long} rather than a {@link ai.riviera.platform.venue.vocabulary.VenueId}
 * because this record is also the wire shape of {@code GET /api/venues/mine} — the typed id is the
 * seam currency (invariant #11), the JSON is {@code {"id": 12, ...}}.
 */
public record OwnedVenueView(long id, String name, String beach) {
}
