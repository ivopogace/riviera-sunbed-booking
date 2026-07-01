package ai.riviera.responsibilityfixture.payment.adapter.out;

import com.stripe.model.PaymentIntent;

/**
 * A Stripe SDK use <em>inside</em> the fixture {@code payment} module — must NOT be flagged
 * by {@code ResponsibilitiesArchitectureTests}' Stripe rule, proving the payment-module
 * exclusion path of the collector (not just the violation path).
 */
final class FixtureStripeGateway {

	private FixtureStripeGateway() {
	}

	static String describe(PaymentIntent intent) {
		return intent.getId();
	}
}
