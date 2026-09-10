package ai.riviera.platform.payout.adapter.in;

import ai.riviera.platform.payout.application.VenueChangeFeeAmount;

/**
 * The venue-change fee on the wire: integer minor units + ISO currency (invariant #5).
 *
 * <p>It carries no last-changed field. Who changed the fee, when and on what grounds is the admin
 * audit trail's record, and a second half-history here would only disagree with it.
 */
record VenueChangeFeeView(long amountMinor, String currency) {

	static VenueChangeFeeView of(VenueChangeFeeAmount fee) {
		return new VenueChangeFeeView(fee.minorUnits(), fee.currency());
	}
}
