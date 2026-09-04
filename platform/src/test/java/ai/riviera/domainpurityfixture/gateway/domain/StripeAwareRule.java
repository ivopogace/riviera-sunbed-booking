package ai.riviera.domainpurityfixture.gateway.domain;

import com.stripe.model.PaymentIntent;

/** Impure: a domain rule that knows what a PaymentIntent is. */
public final class StripeAwareRule {

	private StripeAwareRule() {
	}

	public static boolean isSettled(PaymentIntent intent) {
		return "succeeded".equals(intent.getStatus());
	}
}
