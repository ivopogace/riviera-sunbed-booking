package ai.riviera.connectfixture;

import com.stripe.exception.StripeException;
import com.stripe.model.Payout;

/** Reads a payout from the Stripe balance, which the platform never makes (BKT pays venues). */
public final class BalancePayout {

	private BalancePayout() {
	}

	public static Payout find(String payoutId) throws StripeException {
		return Payout.retrieve(payoutId);
	}
}
