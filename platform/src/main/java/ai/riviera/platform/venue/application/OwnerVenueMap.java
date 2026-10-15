package ai.riviera.platform.venue.application;

import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueId;
import ai.riviera.platform.venue.vocabulary.VenueMapView;

/**
 * Driven port: the venue map in the tourist read's exact shape, <strong>without</strong> the
 * tourist-visibility fence, for a caller that has already asserted ownership (invariant #13) — a
 * {@code PENDING} owner lays out and prices a venue tourists cannot see yet. Internal to the module,
 * implemented by its own JDBC adapter, so {@code application}, not {@code api/} (invariant #11).
 * Rationale: RESPONSIBILITIES.md §venue.
 */
public interface OwnerVenueMap {

	/**
	 * The venue and its map for {@code stay} (Tirane civil days, invariant #6) as
	 * {@code VenueCatalog#findVenueMap} composes it, fence aside: empty only if the venue does not exist.
	 */
	Optional<VenueMapView> mapFor(VenueId id, StaySpan stay);
}
