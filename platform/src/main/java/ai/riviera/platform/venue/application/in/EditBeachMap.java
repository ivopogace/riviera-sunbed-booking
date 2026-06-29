package ai.riviera.platform.venue.application.in;

import ai.riviera.platform.venue.api.SetId;
import ai.riviera.platform.venue.api.VenueId;

/**
 * Driving (inbound) port for editing a venue's beach-map layout (U7) — incremental per-set
 * CRUD. Internal to the {@code venue} module (REST-only caller), so it lives in
 * {@code application.in}, not {@code api/} (invariant #11). One purposeful conversation:
 * place, re-place, and remove a set position; each method returns a typed outcome so the
 * adapter maps it to HTTP without exceptions for expected flows.
 *
 * <p>Layout integrity (one set per cell / per position) is guarded by the DB UNIQUE
 * constraints (V2/V12) as the hard backstop; these methods pre-check to return a precise
 * {@link SetRejection} rather than surfacing a raw constraint violation.
 */
public interface EditBeachMap {

	/** Place a new set on the venue's map. */
	AddSetOutcome addSet(VenueId venueId, SetCommand command);

	/** Re-place an existing set (tier, pool, price, coordinates) — the pool split is editable. */
	ChangeOutcome editSet(VenueId venueId, SetId setId, SetCommand command);

	/** Remove a set from the venue's map. */
	ChangeOutcome removeSet(VenueId venueId, SetId setId);
}
