package ai.riviera.platform.venue.api;

import java.time.LocalDate;
import java.util.OptionalInt;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code venue} module's published rate-configuration port (invariant #11), for {@code payout}
 * (accrual, daily takings) and {@code booking} (late-cancel refund). Rates are mutable configuration
 * read at decision time, never carried on an event: decisions read the live {@link #commissionBps},
 * reports on days already sold read {@link #commissionBpsOn}. Rationale: RESPONSIBILITIES.md §venue.
 */
public interface VenueRates {

	/**
	 * The live commission rate in bps (1500 = 15.00%), or empty if no such venue — the only read an accrual
	 * may use: {@code floorDiv(gross × bps, 10000)} (#5), persisted on the ledger entry (#9). Never substitute
	 * {@link #commissionBpsOn}: a booking accrues at the rate in force when confirmed.
	 */
	OptionalInt commissionBps(VenueId id);

	/**
	 * The bps rate for bookings served on {@code serviceDate} (Tirane civil date, #6) off the effective-dated
	 * schedule, for reporting only; empty only for no such venue. A past date's answer never changes (#9), but
	 * it is one rate per day, not exact agreement with the ledger's per-booking accruals.
	 */
	OptionalInt commissionBpsOn(VenueId id, LocalDate serviceDate);

	/**
	 * The after-cutoff refund share in bps (5000 = 50.00%, 0 = none, 10000 = full), or empty if no such
	 * venue; {@code booking} computes {@code floorDiv(gross × bps, 10000)} server-side (#10, #5). A
	 * before-cutoff cancellation is always a full refund and never consults it.
	 */
	OptionalInt lateCancelRefundBps(VenueId id);
}
