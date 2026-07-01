package ai.riviera.platform.venue.application;

import ai.riviera.platform.operator.api.OperatorId;
import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueId;

/**
 * Driving (inbound) port for editing a venue's beach-map layout (U7) — incremental per-set
 * CRUD. Internal to the {@code venue} module (REST-only caller), so it lives in
 * {@code application}, not {@code api/} (invariant #11). One purposeful conversation:
 * place, re-place, and remove a set position; each method returns a typed outcome so the
 * adapter maps it to HTTP without exceptions for expected flows.
 *
 * <p>Every method is venue-scoped and takes the authenticated {@link OperatorId} as its first
 * argument: the implementation verifies the operator owns {@code venueId} before any read/write
 * (invariant #13, BOLA), throwing {@code NotVenueOwnerException} (→ 403) on a mismatch. Layout
 * integrity (one set per cell / per position) is guarded by the DB UNIQUE constraints (V2/V12) as
 * the hard backstop; these methods pre-check to return a precise {@link SetRejection} rather than
 * surfacing a raw constraint violation.
 */
public interface EditBeachMap {

	/** Place a new set on the venue's map (after asserting {@code operator} owns {@code venueId}). */
	AddSetOutcome addSet(OperatorId operator, VenueId venueId, SetCommand command);

	/** Re-place an existing set (tier, pool, price, coordinates) — the pool split is editable. */
	ChangeOutcome editSet(OperatorId operator, VenueId venueId, SetId setId, SetCommand command);

	/** Remove a set from the venue's map. */
	ChangeOutcome removeSet(OperatorId operator, VenueId venueId, SetId setId);
}
