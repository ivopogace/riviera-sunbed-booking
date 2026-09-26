package ai.riviera.platform.payment.adapter.out;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import ai.riviera.platform.payment.api.CollectionGuarantee;

/**
 * The two answers to {@link CollectionGuarantee}, bound to the same profiles as, and kept beside,
 * the gateways they describe ({@code StubPaymentGateway}, {@code StripePaymentGateway}). A separate
 * role port, not a {@code PaymentGateway} method, so the gateway seam stays about moving money.
 *
 * <p>A new gateway must add its answer here: {@code PaymentGatewayContractCoverageArchitectureTest}
 * matches each gateway to the guarantee sharing its profile and fails the build on a gap.
 * Rationale: RESPONSIBILITIES.md §payment.
 */
final class ProfiledCollectionGuarantee {

	private ProfiledCollectionGuarantee() {
	}

	/** The in-process stub reports {@code Succeeded} without taking money — nothing was collected. */
	@Component
	@Profile("!stripe")
	static class StubGatewayCollection implements CollectionGuarantee {

		@Override
		public boolean provenBeforeConfirmation() {
			return false;
		}
	}

	/** Stripe returns {@code Pending}; only the signature-verified webhook confirms (invariant #8). */
	@Component
	@Profile("stripe")
	static class StripeGatewayCollection implements CollectionGuarantee {

		@Override
		public boolean provenBeforeConfirmation() {
			return true;
		}
	}
}
