package ai.riviera.platform.venue.api;

import java.util.Optional;

/**
 * The {@code venue} module's published query port (invariant #11) — the one real seam for
 * reading a venue and its beach map. A deep module: this small interface hides the SQL
 * join, the from-price computation, and the view assembly. Consumed by the module's own
 * REST adapter today and by the {@code booking} module (U3) for set/price lookup later.
 */
public interface VenueCatalog {

	/** The venue and its beach map, or empty if no venue has that id. */
	Optional<VenueMapView> findVenueMap(VenueId id);
}
