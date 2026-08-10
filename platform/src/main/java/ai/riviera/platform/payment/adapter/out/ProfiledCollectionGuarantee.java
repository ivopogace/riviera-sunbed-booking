package ai.riviera.platform.payment.adapter.out;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import ai.riviera.platform.payment.api.CollectionGuarantee;

/**
 * The two answers to {@link CollectionGuarantee}, bound to the same profiles as the gateways
 * they describe and living beside them on purpose — {@code StubPaymentGateway} and
 * {@code StripePaymentGateway} are in this package, so the profile expression and the gateway it
 * characterizes stay one file apart rather than one module apart.
 *
 * <p>Deliberately <strong>not</strong> a method on {@code PaymentGateway}: several fakes implement
 * that port (one as a {@code @FunctionalInterface}), and widening it to carry a deployment property
 * that no caller of {@code initiate}/{@code refund} needs is the wide-port smell #94 split apart.
 * A separate role-scoped port keeps the gateway seam about moving money.
 *
 * <p>Adding a third gateway means adding its answer here — a one-line obligation in the package that
 * already owns the profile split, instead of a duplicated {@code @Profile("stripe")} in a consuming
 * module that no structural test can see. The obligation is enforced, not merely conventional:
 * {@code PaymentGatewayContractCoverageArchitectureTest} matches each gateway to the guarantee
 * sharing its profile, and a gateway with no answer here fails the build.
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
