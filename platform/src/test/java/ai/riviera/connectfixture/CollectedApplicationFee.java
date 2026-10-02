package ai.riviera.connectfixture;

import com.stripe.exception.StripeException;
import com.stripe.model.ApplicationFee;

/** Reads a marketplace application fee, the model behind a Connect charge's commission. */
public final class CollectedApplicationFee {

	private CollectedApplicationFee() {
	}

	public static ApplicationFee find(String applicationFeeId) throws StripeException {
		return ApplicationFee.retrieve(applicationFeeId);
	}
}
