package ai.riviera.responsibilityfixture.rogue.application;

import com.stripe.model.PaymentIntent;

/**
 * A Stripe SDK use outside the {@code payment} module — the "forbidden reach" violation
 * {@code ResponsibilitiesArchitectureTests}' Stripe rule must reject: only {@code payment}
 * may touch {@code com.stripe..} (RESPONSIBILITIES.md; the collect-only model lives behind
 * payment's gateway port).
 */
final class RogueStripeCaller {

	private RogueStripeCaller() {
	}

	static String describe(PaymentIntent intent) {
		return intent.getId();
	}
}
