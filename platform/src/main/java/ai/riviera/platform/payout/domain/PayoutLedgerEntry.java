package ai.riviera.platform.payout.domain;

import ai.riviera.platform.venue.api.VenueId;

/**
 * One payout-ledger entry — what the platform owes a venue for a booking (invariant #9). A value
 * object: immutable, transparent, and the home of the commission arithmetic so the math lives with
 * the data it produces rather than scattered in an adapter.
 *
 * <p>Money is integer minor units + ISO currency (invariant #5); {@code net = gross − commission}.
 * The canonical constructor guards the amount invariants the DB also enforces (defence in depth) so
 * a malformed entry can never be constructed in the first place.
 */
public record PayoutLedgerEntry(VenueId venueId, long bookingId, EntryType entryType,
		long grossMinor, long commissionMinor, long netMinor, String currency) {

	private static final long BPS_DENOMINATOR = 10_000L;

	public PayoutLedgerEntry {
		if (venueId == null || entryType == null || currency == null || currency.isBlank()) {
			throw new IllegalArgumentException("venueId, entryType and currency are required");
		}
		if (grossMinor < 0 || commissionMinor < 0 || netMinor < 0) {
			throw new IllegalArgumentException("amounts must be non-negative (minor units)");
		}
		if (netMinor != grossMinor - commissionMinor) {
			throw new IllegalArgumentException("net must equal gross - commission");
		}
	}

	/**
	 * Build the {@code ACCRUAL} entry for a confirmed booking. Commission is exact integer minor
	 * units, rounded <strong>down</strong> (invariant #5 — division happens here, so the direction
	 * is written down): {@code commission = floorDiv(gross × bps, 10000)}; the venue keeps the
	 * sub-cent remainder ({@code net = gross − commission}). {@code bps} is the venue's commission
	 * rate in basis points (1500 = 15.00%), read from {@code venue::api} at accrual time.
	 */
	public static PayoutLedgerEntry accrual(VenueId venueId, long bookingId, long grossMinor,
			int commissionBps, String currency) {
		long commission = Math.floorDiv(grossMinor * commissionBps, BPS_DENOMINATOR);
		return new PayoutLedgerEntry(venueId, bookingId, EntryType.ACCRUAL, grossMinor, commission,
				grossMinor - commission, currency);
	}
}
