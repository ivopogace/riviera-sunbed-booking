package ai.riviera.platform.venue.api;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetSpot;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code venue} module's published <strong>set-facts</strong> port (invariant #11) —
 * the booking-relevant truths about a single set, split out of {@code VenueCatalog} by
 * consumer role so callers depend only on the surface they use. Consumed by
 * {@code booking} (reserve, cancel, view) and {@code availability} (claim pool check,
 * staff mark).
 *
 * <p>{@link #sellsOnlineOn} is the one read here that is about the venue's day rather than a set:
 * it belongs to this port because it answers the same conversation {@link #freeOnlineSetsOn} does —
 * what can still be booked at this venue on this date — and because {@code VenueCatalog} is the
 * tourist-read port siblings may not take ({@code VenueApiRoleSplitTests}).
 *
 * <p>Deliberately <strong>not</strong> fenced by tourist visibility ({@code
 * operator.api.VenueVisibility}), and the one port that still answers for a <strong>retired</strong>
 * set (ADR-0019): sold-booking paths — cancel, view, mails, staff lookups — must keep resolving a
 * hidden venue's sets and a spot that has since left the map. The reserve path applies the
 * visibility fence itself; {@link #poolForClaim} is the retired-set fence for both claim paths.
 */
public interface SetBookingFacts {

	/**
	 * The {@link Pool} of the given set, or empty if no set has that id, read <strong>under a row
	 * lock held for the caller's transaction</strong>. Used by the {@code availability} module to
	 * enforce invariant #3 (an online booking can only target a {@link Pool#ONLINE} set) before
	 * claiming, without reaching into venue's tables.
	 *
	 * <p>Also the claim-time existence gate: it reads the <em>active</em> map, so a retired set
	 * answers empty here while {@link #setBookingInfo} still resolves it — which is why the staff
	 * mark, pool-agnostic as it is, takes this read before writing its hold.
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
	 * evening-before cutoff), or empty if no set has that id — a retired set still answers, with the
	 * row label and position it had. Consumed by the {@code booking}
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

	/**
	 * Every active set of the venue as a spot — placement, tier and pool — in id order; empty for an
	 * unknown venue. The remodel classification resolves a disturbed set's own spot here. Reads the
	 * active map: a retired set is not a spot.
	 */
	List<SetSpot> activeSetsOf(VenueId venueId);

	/**
	 * The venue's active {@code ONLINE}-pool sets with no availability row on {@code date} — the
	 * spots a booking on that date could move to — in id order. A snapshot: nothing is held, and a
	 * claim may land on any of them before the caller acts.
	 */
	List<SetSpot> freeOnlineSetsOn(VenueId venueId, LocalDate date);

	/**
	 * Whether the venue's online sales for {@code date} are open right now — the sales close on the
	 * day itself and the season closure together, the same per-date projection the tourist list and
	 * map carry (invariant #4). False for an unknown venue. The read a mail takes before it offers a
	 * guest a day to book again; the reserve path enforces the fence itself, so this is advisory.
	 */
	boolean sellsOnlineOn(VenueId venueId, LocalDate date);
}
