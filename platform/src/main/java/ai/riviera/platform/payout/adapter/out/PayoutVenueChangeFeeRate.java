package ai.riviera.platform.payout.adapter.out;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.spi.VenueChangeFeeRate;
import ai.riviera.platform.booking.vocabulary.VenueChangeFee;
import ai.riviera.platform.payout.application.VenueChangeFeeAmount;

/**
 * {@code payout}'s answer to {@code booking.spi.VenueChangeFeeRate}: the configured fee, in the
 * collection currency (invariant #5). The same amount the cancelled-booking listener charges as a
 * {@code FEE} ledger entry, so what the remodel preview quotes is what the ledger deducts.
 */
@Component
class PayoutVenueChangeFeeRate implements VenueChangeFeeRate {

	private final VenueChangeFeeAmount fee;

	PayoutVenueChangeFeeRate(VenueChangeFeeAmount fee) {
		this.fee = fee;
	}

	@Override
	public VenueChangeFee perRefund() {
		return new VenueChangeFee(fee.minorUnits(), fee.currency());
	}
}
