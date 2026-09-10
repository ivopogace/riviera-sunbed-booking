package ai.riviera.platform.payout.adapter.out;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.spi.VenueChangeFeeRate;
import ai.riviera.platform.booking.vocabulary.VenueChangeFee;
import ai.riviera.platform.payout.application.VenueChangeFeeAmount;
import ai.riviera.platform.payout.application.VenueChangeFeeSetting;

/**
 * {@code payout}'s answer to {@code booking.spi.VenueChangeFeeRate}: the fee in force, in the
 * collection currency (invariant #5). Read per call from the same setting the cancelled-booking
 * listener charges from, so what the remodel preview quotes is what the ledger deducts — unless an
 * admin changes the fee between the two, the accepted window in {@code RESPONSIBILITIES.md}
 * §{@code payout}.
 */
@Component
class PayoutVenueChangeFeeRate implements VenueChangeFeeRate {

	private final VenueChangeFeeSetting setting;

	PayoutVenueChangeFeeRate(VenueChangeFeeSetting setting) {
		this.setting = setting;
	}

	@Override
	public VenueChangeFee perRefund() {
		VenueChangeFeeAmount fee = setting.current();
		return new VenueChangeFee(fee.minorUnits(), fee.currency());
	}
}
