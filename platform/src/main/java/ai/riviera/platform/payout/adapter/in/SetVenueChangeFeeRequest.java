package ai.riviera.platform.payout.adapter.in;

import ai.riviera.platform.payout.application.VenueChangeFeeAmount;

/**
 * The {@code PUT /api/admin/venue-change-fee} request body: one wire primitive, the amount in
 * integer minor units of the collection currency (invariant #5). The currency is not on the wire —
 * it is the collection currency, not the admin's choice.
 *
 * <p>{@code Long} rather than {@code long} on purpose: an absent field must be distinguishable from
 * an explicit {@code 0}, which is a legitimate fee (a platform that charges nothing for a venue
 * change). A primitive would silently read a missing field as a free change.
 *
 * <p>The range is checked here against {@link VenueChangeFeeAmount#MAX_FEE_MINOR} so client input
 * yields {@code 400 INVALID_REQUEST} through {@code InvalidApiRequestException.parsing}. The same
 * bound guards the value record and the table, where it catches corrupt stored state instead — one
 * constant, three places it must hold.
 */
record SetVenueChangeFeeRequest(Long amountMinor) {

	long toMinorUnits() {
		if (amountMinor == null) {
			throw new IllegalArgumentException("amountMinor is required");
		}
		if (amountMinor < 0 || amountMinor > VenueChangeFeeAmount.MAX_FEE_MINOR) {
			throw new IllegalArgumentException("amountMinor must be between 0 and "
					+ VenueChangeFeeAmount.MAX_FEE_MINOR + " minor units, but was " + amountMinor);
		}
		return amountMinor;
	}
}
