package ai.riviera.connectfixture;

import com.stripe.exception.StripeException;
import com.stripe.model.Transfer;

/** Reads a Connect transfer from the platform balance to a connected account. */
public final class VenueTransferLookup {

	private VenueTransferLookup() {
	}

	public static Transfer find(String id) throws StripeException {
		return Transfer.retrieve(id);
	}
}
