package ai.riviera.platform.venue.api;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * The {@code venue} module's published <strong>set-facts</strong> port (invariant #11) —
 * the booking-relevant truths about a single set, split out of {@code VenueCatalog} by
 * consumer role (issue #94) so callers depend only on the surface they use. Consumed by
 * {@code booking} (reserve, cancel, view) and {@code availability} (claim pool check,
 * staff mark).
 *
 * <p>Deliberately <strong>not</strong> fenced by tourist visibility ({@code
 * operator.api.VenueVisibility}): sold-booking paths — cancel, view, mails, staff marks —
 * must keep answering for a hidden venue's sets. The reserve path applies the fence itself.
 */
public interface SetBookingFacts {

	/**
	 * The {@link Pool} of the given set, or empty if no set has that id, read <strong>under a row
	 * lock held for the caller's transaction</strong>. Used by the {@code availability} module to
	 * enforce invariant #3 (an online booking can only target a {@link Pool#ONLINE} set) before
	 * claiming, without reaching into venue's tables.
	 *
	 * <p>The lock is the weakest one that conflicts with the {@code FOR UPDATE} a per-set layout
	 * edit takes — the same lock this caller's own {@code INSERT} needs for its FK check, only
	 * acquired before the read rather than after it. Without it the pool can change between the
	 * read and the insert, admitting a hold onto a set that just left the online pool. Two
	 * consequences for callers: it must run inside a transaction to mean anything, and it must
	 * <strong>not</strong> be called from a read-only one — hence the name, which is a claim-path
	 * contract, not a general pool lookup.
	 */
	Optional<Pool> poolForClaim(SetId setId);

	/**
	 * The booking-relevant facts about a set (pool, price, owning venue, sales close,
	 * evening-before cutoff), or empty if no set has that id. Consumed by the {@code booking}
	 * module (U3) to enforce the pool rule (invariant #3), record the amount (invariant #5),
	 * and gate/compute the day's boundaries (invariant #4) — in one lookup, without touching
	 * venue's tables (invariant #11).
	 */
	Optional<SetBookingInfo> setBookingInfo(SetId setId);

	/**
	 * The batch form of {@link #setBookingInfo(SetId)} (#246): the same facts for every requested
	 * set, resolved in one lookup, keyed by id. An unknown id is simply absent from the map; an
	 * empty request yields an empty map. Consumed by the {@code booking} module's my-bookings list
	 * so N bookings cost one venue-module query, not N. Deliberately no default implementation —
	 * every adapter must decide batch semantics explicitly, so the N+1 cannot reappear behind a
	 * defaulted per-id loop.
	 */
	Map<SetId, SetBookingInfo> setBookingInfos(Collection<SetId> setIds);
}
