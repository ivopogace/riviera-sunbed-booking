package ai.riviera.platform.payout.adapter.in;

import ai.riviera.platform.payout.application.VenueChangeFeeAmount;

/**
 * The venue-change fee on the wire: integer minor units + ISO currency (invariant #5).
 *
 * <p>No last-changed field: the admin audit trail is this setting's history.
 */
record VenueChangeFeeView(long amountMinor, String currency) {

	static VenueChangeFeeView of(VenueChangeFeeAmount fee) {
		return new VenueChangeFeeView(fee.minorUnits(), fee.currency());
	}
}
