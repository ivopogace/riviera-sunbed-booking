package ai.riviera.platform.payment.application.out;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.api.Money;
import ai.riviera.platform.payment.api.PaymentOutcome;

/**
 * The module-internal <strong>outbound</strong> port for the actual payment provider — the
 * driven seam (riviera-stripe-payments). This is the project's gateway-agnostic boundary:
 * the domain depends on this interface, not on Stripe types. U3 ships a
 * {@code StubPaymentGateway}; U4 replaces it with a Stripe adapter behind this same port —
 * the only seam that changes.
 *
 * <p>Not part of the module's {@code api/} — only {@code payment}'s own application layer
 * depends on it (invariant #11).
 */
public interface PaymentGateway {

	/** Charge the booking's card for {@code amount}; return a typed outcome (never throws on decline). */
	PaymentOutcome charge(BookingRef booking, Money amount);
}
