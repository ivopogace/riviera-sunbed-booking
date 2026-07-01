package ai.riviera.platform.venue.api;

import java.util.OptionalInt;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code venue} module's published <strong>rate-configuration</strong> port
 * (invariant #11) — the per-venue basis-point rates, split out of {@code VenueCatalog} by
 * consumer role (issue #94). Rates are mutable venue configuration read at decision time,
 * never carried on an event. Consumed by {@code payout} (commission accrual) and
 * {@code booking} (late-cancel refund policy).
 */
public interface VenueRates {

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
