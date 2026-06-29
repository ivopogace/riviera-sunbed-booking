package ai.riviera.platform.venue.api;

import java.time.LocalDate;
import java.util.Optional;
import java.util.OptionalInt;

/**
 * The {@code venue} module's published query port (invariant #11) — the one real seam for
 * reading a venue and its beach map. A deep module: this small interface hides the SQL
 * join, the from-price computation, and the view assembly. Consumed by the module's own
 * REST adapter today and by the {@code booking} module (U3) for set/price lookup later.
 */
public interface VenueCatalog {

	/**
	 * The venue and its beach map for a given day, or empty if no venue has that id. Each set's
	 * {@code availability} reflects the authoritative {@code set_availability} state for
	 * {@code date} (invariant #2) — a set booked for that date renders {@code TAKEN}, otherwise
	 * {@code FREE} (issue #44).
	 *
	 * @param id   the venue
	 * @param date the calendar day to render availability for, a {@code LocalDate} in
	 *             {@code Europe/Tirane} (invariant #6)
	 */
	Optional<VenueMapView> findVenueMap(VenueId id, LocalDate date);

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

	/**
	 * The venue's commission rate in <strong>basis points</strong> (1500 = 15.00%), or empty if no
	 * venue has that id. Read by the {@code payout} module to compute the commission on a confirmed
	 * booking (invariant #9): {@code commission = floorDiv(gross × bps, 10000)}, integer-exact
	 * (invariant #5). It is deliberately <em>not</em> carried on the {@code BookingConfirmed} event —
	 * the rate is mutable venue configuration, re-read here at accrual time, not a fixed fact of the
	 * booking (invariant #11).
	 */
	OptionalInt commissionBps(VenueId id);

	/**
	 * The venue's <strong>after-cutoff</strong> refund share in <strong>basis points</strong>
	 * (5000 = 50.00%, 0 = non-refundable, 10000 = full), or empty if no venue has that id. Read by
	 * the {@code booking} module to compute a late cancellation's refund server-side (invariant
	 * #10): {@code refund = floorDiv(gross × bps, 10000)}, integer-exact (invariant #5). Cancelling
	 * <em>before</em> the cutoff is always a full refund and does not consult this rate. Like
	 * {@link #commissionBps}, it is mutable venue configuration read at decision time, never carried
	 * on an event.
	 */
	OptionalInt lateCancelRefundBps(VenueId id);
}
