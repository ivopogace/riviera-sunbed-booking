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

	/**
	 * The pool token ({@code "ONLINE"} or {@code "WALK_IN"}) of the given set, or empty if no
	 * set has that id. Used by the {@code availability} module to enforce invariant #3 (an
	 * online booking can only target an {@code ONLINE}-pool set) before claiming, without
	 * reaching into venue's tables. The token is the same string the database CHECK constraint
	 * stores and the read views carry.
	 */
	Optional<String> poolOf(SetId setId);

	/**
	 * The booking-relevant facts about a set (pool, price, owning venue, evening-before
	 * cutoff), or empty if no set has that id. Consumed by the {@code booking} module (U3)
	 * to enforce the pool rule (invariant #3), record the amount (invariant #5), and compute
	 * the cutoff (invariant #4) — in one lookup, without touching venue's tables (invariant
	 * #11).
	 */
	Optional<SetBookingInfo> setBookingInfo(SetId setId);
}
