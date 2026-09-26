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
 * The {@code venue} module's published set-facts port (invariant #11) for {@code booking} and
 * {@code availability}; {@link #sellsOnlineOn} lives here because {@code VenueCatalog} is tourist-only.
 * Deliberately <strong>not</strong> visibility-fenced, and the one port that still answers for a retired
 * set (ADR-0019): sold-booking paths must keep resolving them. The reserve path fences visibility itself;
 * {@link #poolForClaim} is the retired-set fence for both claim paths. Rationale: RESPONSIBILITIES.md §venue.
 */
public interface SetBookingFacts {

	/**
	 * The set's {@link Pool} under a {@code FOR KEY SHARE} lock held for the caller's transaction, or empty if
	 * absent or retired: the invariant #3 check ({@link Pool#ONLINE}) and the claim-time existence gate. Must run
	 * in a transaction, never a read-only one. Rationale: RESPONSIBILITIES.md §venue.
	 */
	Optional<Pool> poolForClaim(SetId setId);

	/**
	 * The set's booking facts (pool, price, venue, sales close, cutoff), or empty if no such set; a retired
	 * set still answers with its old label and position. Feeds {@code booking}'s pool rule (invariant #3),
	 * amount (#5) and day boundaries (#4).
	 */
	Optional<SetBookingInfo> setBookingInfo(SetId setId);

	/**
	 * Batch {@link #setBookingInfo(SetId)} in one query, keyed by id; unknown ids are absent, empty in gives
	 * empty out. No default implementation on purpose: a defaulted per-id loop would reintroduce the N+1.
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
	 * Whether online sales for {@code date} are open right now (on-day close + season closure, invariant #4);
	 * false for an unknown venue. Advisory, for mails — the reserve path enforces the fence itself.
	 */
	boolean sellsOnlineOn(VenueId venueId, LocalDate date);
}
