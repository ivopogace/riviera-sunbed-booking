package ai.riviera.connectfixture;

import com.stripe.exception.StripeException;
import com.stripe.model.Account;

/** Reads a connected account, the venue-side half of a Connect marketplace. */
public final class ConnectedAccountLookup {

	private ConnectedAccountLookup() {
	}

	public static Account find(String id) throws StripeException {
		return Account.retrieve(id);
	}
}
