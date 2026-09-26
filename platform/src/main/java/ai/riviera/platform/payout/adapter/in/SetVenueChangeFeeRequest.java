package ai.riviera.platform.payout.adapter.in;

import ai.riviera.platform.payout.application.VenueChangeFeeAmount;

/**
 * The {@code PUT /api/admin/venue-change-fee} body: the amount in integer minor units of the
 * collection currency (invariant #5); the currency is not on the wire.
 *
 * <p>{@code Long}, never {@code long}: {@code 0} is a legitimate fee, so a primitive would read a
 * missing field as a free change. The range is checked against
 * {@link VenueChangeFeeAmount#MAX_FEE_MINOR} so bad input is {@code 400 INVALID_REQUEST} (via
 * {@code InvalidApiRequestException.parsing}); the same constant bounds the value record and table.
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
