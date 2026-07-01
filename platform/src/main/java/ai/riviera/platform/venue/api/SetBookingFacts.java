package ai.riviera.platform.venue.api;

import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The {@code venue} module's published <strong>set-facts</strong> port (invariant #11) —
 * the booking-relevant truths about a single set, split out of {@code VenueCatalog} by
 * consumer role (issue #94) so callers depend only on the surface they use. Consumed by
 * {@code booking} (reserve, cancel, view) and {@code availability} (claim pool check,
 * staff mark).
 */
public interface SetBookingFacts {

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
