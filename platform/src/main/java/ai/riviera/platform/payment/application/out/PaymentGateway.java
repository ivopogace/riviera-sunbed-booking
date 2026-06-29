package ai.riviera.platform.payment.application.out;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.PaymentOutcome;

/**
 * The module-internal <strong>outbound</strong> port for the actual payment provider — the
 * driven seam (riviera-stripe-payments). This is the project's gateway-agnostic boundary:
 * the domain depends on this interface, not on Stripe types. The default-profile
 * {@code StubPaymentGateway} returns {@link PaymentOutcome.Succeeded} in-process; the
 * {@code stripe}-profile {@code StripePaymentGateway} (U4) creates a PaymentIntent and returns
 * {@link PaymentOutcome.Pending} — the only seam that changes between the two.
 *
 * <p>Not part of the module's {@code api/} — only {@code payment}'s own application layer
 * depends on it (invariant #11).
 */
public interface PaymentGateway {

	/**
	 * Initiate collection of {@code amount} for the booking. Returns a typed outcome (never
	 * throws on a decline / expected failure): {@code Succeeded} when collected in-process
	 * (stub), {@code Pending} when a PaymentIntent was created and a signature-verified webhook
	 * will complete it (Stripe, invariant #8), or {@code Failed}.
	 */
	PaymentOutcome initiate(BookingRef booking, Money amount);
}
