package ai.riviera.platform.venue.application;

/**
 * One row of the operator's own-venues picker (S9, issue #277) — just enough to name a venue and
 * route to its console: its technical id, its name, and the beach it sits on. Deliberately carries
 * <strong>no</strong> commission, payout currency, availability or pricing: the venue picker on the
 * post-sign-in landing needs none of it, and the operator-only financial fields already have their
 * own owner-asserted read ({@link VenueProfileView}).
 *
 * <p>The {@code id} is a plain {@code long} rather than a {@link ai.riviera.platform.venue.vocabulary.VenueId}
 * because this record is also the wire shape of {@code GET /api/venues/mine} — the typed id is the
 * seam currency (invariant #11), the JSON is {@code {"id": 12, ...}}.
 */
public record OwnedVenueView(long id, String name, String beach) {
}
